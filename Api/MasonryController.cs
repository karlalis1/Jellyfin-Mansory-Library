using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace JellyfinMasonry.Api
{
    public class MasonryLayoutLookupResponse
    {
        public double Ratio { get; set; }

        public double AppliedRatio { get; set; }

        public double SearchAppliedRatio { get; set; }

        public string Shape { get; set; } = "square";

        public string SearchShape { get; set; } = "square";

        public int DefaultRowSpan { get; set; }

        public int SearchRowSpan { get; set; }

        public bool IsPhoto { get; set; }
    }

    public class RatioLookupRequest
    {
        public Guid ParentId { get; set; }

        public List<string> ItemIds { get; set; } = new();
    }

    [ApiController]
    [Route("Masonry")]
    [Produces(MediaTypeNames.Application.Json)]
    public class MasonryController : ControllerBase
    {
        private const double DefaultRatio = 16d / 9d;
        private const double SearchRatioMin = 0.82d;
        private const double SearchRatioMax = 1.32d;
        private const double SearchRatioBlend = 0.58d;
        private const double SearchPhotoRatioMin = 0.92d;
        private const double SearchPhotoRatioMax = 1.08d;
        private const double SearchPhotoRatioBlend = 0.82d;
        private const int GridRowHeight = 8;
        private const int GridGap = 14;
        private const int DefaultColumnWidth = 236;
        private const int SearchColumnWidth = 280;
        private const int CardTextHeight = 72;

        private readonly RatioCacheService _cacheService;
        private readonly ILogger<MasonryController> _logger;

        public MasonryController(RatioCacheService cacheService, ILogger<MasonryController> logger)
        {
            _cacheService = cacheService;
            _logger = logger;
        }

        /// <summary>
        /// Get cached aspect ratios for a library.
        /// Returns { "itemId": ratio, ... }
        /// </summary>
        [HttpGet("Ratios/{parentId}")]
        [Authorize]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<Dictionary<string, double>>> GetRatios(
            [FromRoute, Required] Guid parentId,
            CancellationToken cancellationToken)
        {
            var cached = _cacheService.GetCache(parentId);

            if (cached == null)
            {
                _logger.LogInformation("Masonry: Cache miss for {ParentId}, scanning now", parentId);
                await _cacheService.ScanLibrary(parentId, cancellationToken);
                cached = _cacheService.GetCache(parentId);
            }

            if (cached == null || cached.Count == 0)
            {
                return NotFound($"No ratios found for library {parentId}");
            }

            // Guid -> string für JSON
            var result = cached.ToDictionary(
                kvp => kvp.Key.ToString(),
                kvp => kvp.Value.Ratio
            );

            return Ok(result);
        }

        /// <summary>
        /// Get cached aspect ratios for a specific subset of items.
        /// </summary>
        [HttpPost("Ratios/Lookup")]
        [Authorize]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<ActionResult<Dictionary<string, double>>> LookupRatios(
            [FromBody] RatioLookupRequest request,
            CancellationToken cancellationToken)
        {
            if (request.ParentId == Guid.Empty || request.ItemIds.Count == 0)
            {
                return Ok(new Dictionary<string, double>());
            }

            var cached = _cacheService.GetCache(request.ParentId);

            if (cached == null)
            {
                _logger.LogInformation("Masonry: Cache miss for lookup {ParentId}, scanning now", request.ParentId);
                await _cacheService.ScanLibrary(request.ParentId, cancellationToken);
                cached = _cacheService.GetCache(request.ParentId);
            }

            if (cached == null || cached.Count == 0)
            {
                return Ok(new Dictionary<string, double>());
            }

            var requestedIds = request.ItemIds
                .Select(id => Guid.TryParse(id, out var guid) ? guid : Guid.Empty)
                .Where(id => id != Guid.Empty)
                .ToHashSet();

            var result = cached
                .Where(kvp => requestedIds.Contains(kvp.Key))
                .ToDictionary(kvp => kvp.Key.ToString(), kvp => kvp.Value.Ratio);

            return Ok(result);
        }

        /// <summary>
        /// Get precomputed layout metadata for a specific subset of items.
        /// </summary>
        [HttpPost("Layout/Lookup")]
        [Authorize]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<ActionResult<Dictionary<string, MasonryLayoutLookupResponse>>> LookupLayout(
            [FromBody] RatioLookupRequest request,
            CancellationToken cancellationToken)
        {
            if (request.ParentId == Guid.Empty || request.ItemIds.Count == 0)
            {
                return Ok(new Dictionary<string, MasonryLayoutLookupResponse>());
            }

            var cached = _cacheService.GetCache(request.ParentId);

            if (cached == null)
            {
                _logger.LogInformation("Masonry: Cache miss for layout lookup {ParentId}, scanning now", request.ParentId);
                await _cacheService.ScanLibrary(request.ParentId, cancellationToken);
                cached = _cacheService.GetCache(request.ParentId);
            }

            if (cached == null || cached.Count == 0)
            {
                return Ok(new Dictionary<string, MasonryLayoutLookupResponse>());
            }

            var requestedIds = request.ItemIds
                .Select(id => Guid.TryParse(id, out var guid) ? guid : Guid.Empty)
                .Where(id => id != Guid.Empty)
                .ToHashSet();

            var result = cached
                .Where(kvp => requestedIds.Contains(kvp.Key))
                .ToDictionary(
                    kvp => kvp.Key.ToString(),
                    kvp => BuildLayoutResponse(kvp.Value));

            return Ok(result);
        }

        /// <summary>
        /// Force refresh cache for a specific library.
        /// </summary>
        [HttpPost("Ratios/{parentId}/Refresh")]
        [Authorize(Policy = "RequiresElevation")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        public async Task<ActionResult> RefreshRatios(
            [FromRoute, Required] Guid parentId,
            CancellationToken cancellationToken)
        {
            _cacheService.InvalidateCache(parentId);
            await _cacheService.ScanLibrary(parentId, cancellationToken);
            return NoContent();
        }

        /// <summary>
        /// Force refresh cache for all libraries.
        /// </summary>
        [HttpPost("Ratios/RefreshAll")]
        [Authorize(Policy = "RequiresElevation")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        public async Task<ActionResult> RefreshAllRatios(CancellationToken cancellationToken)
        {
            _cacheService.InvalidateAllCaches();
            await _cacheService.ScanAllLibraries(cancellationToken);
            return NoContent();
        }

        /// <summary>
        /// Get cache status.
        /// </summary>
        [HttpGet("Status")]
        [Authorize]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public ActionResult<object> GetStatus([FromQuery] Guid? parentId)
        {
            if (parentId.HasValue)
            {
                return Ok(new
                {
                    ParentId = parentId,
                    IsCacheValid = _cacheService.IsCacheValid(parentId.Value),
                    ItemCount = _cacheService.GetCache(parentId.Value)?.Count ?? 0
                });
            }

            return Ok(new { Status = "Masonry Plugin running" });
        }

        private static MasonryLayoutLookupResponse BuildLayoutResponse(MasonryItemCacheEntry entry)
        {
            var safeRatio = SanitizeRatio(entry.Ratio);
            var appliedRatio = safeRatio;
            var searchAppliedRatio = NormalizeSearchRatio(safeRatio, entry.IsPhoto);

            return new MasonryLayoutLookupResponse
            {
                Ratio = safeRatio,
                AppliedRatio = appliedRatio,
                SearchAppliedRatio = searchAppliedRatio,
                Shape = GetShape(appliedRatio),
                SearchShape = GetShape(searchAppliedRatio),
                DefaultRowSpan = CalculateRowSpan(appliedRatio, DefaultColumnWidth),
                SearchRowSpan = CalculateRowSpan(searchAppliedRatio, SearchColumnWidth),
                IsPhoto = entry.IsPhoto
            };
        }

        private static double SanitizeRatio(double ratio)
        {
            return ratio > 0 ? ratio : DefaultRatio;
        }

        private static double NormalizeSearchRatio(double ratio, bool isPhoto)
        {
            var safeRatio = SanitizeRatio(ratio);

            if (isPhoto)
            {
                var clampedPhotoRatio = Math.Min(Math.Max(safeRatio, SearchPhotoRatioMin), SearchPhotoRatioMax);
                return (clampedPhotoRatio * (1 - SearchPhotoRatioBlend)) + (1 * SearchPhotoRatioBlend);
            }

            var clampedRatio = Math.Min(Math.Max(safeRatio, SearchRatioMin), SearchRatioMax);
            var targetRatio = 1d;

            if (clampedRatio < 0.95d)
            {
                targetRatio = 0.9d;
            }
            else if (clampedRatio > 1.12d)
            {
                targetRatio = 1.18d;
            }

            return (clampedRatio * (1 - SearchRatioBlend)) + (targetRatio * SearchRatioBlend);
        }

        private static string GetShape(double ratio)
        {
            if (ratio < 0.9d)
            {
                return "portrait";
            }

            if (ratio > 1.2d)
            {
                return "landscape";
            }

            return "square";
        }

        private static int CalculateRowSpan(double ratio, int columnWidth)
        {
            var safeRatio = SanitizeRatio(ratio);
            var imageHeight = columnWidth / safeRatio;
            var totalHeight = imageHeight + CardTextHeight;
            return Math.Max(1, (int)Math.Ceiling((totalHeight + GridGap) / (GridRowHeight + GridGap)));
        }
    }
}
