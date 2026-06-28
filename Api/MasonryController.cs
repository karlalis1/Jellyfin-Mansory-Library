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
    [ApiController]
    [Route("Masonry")]
    [Produces(MediaTypeNames.Application.Json)]
    public class MasonryController : ControllerBase
    {
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
                kvp => kvp.Value
            );

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
    }
}
