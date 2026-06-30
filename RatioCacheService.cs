using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace JellyfinMasonry
{
    public class MasonryItemCacheEntry
    {
        public double Ratio { get; init; }

        public bool IsPhoto { get; init; }
    }

    public class RatioCacheService
    {
        private readonly ILibraryManager _libraryManager;
        private readonly ILogger<RatioCacheService> _logger;

        // parentId -> { itemId -> cached masonry metadata }
        private readonly ConcurrentDictionary<Guid, Dictionary<Guid, MasonryItemCacheEntry>> _cache = new();
        private readonly ConcurrentDictionary<Guid, DateTime> _cacheTimestamps = new();

        public static RatioCacheService? Instance { get; private set; }

        public RatioCacheService(ILibraryManager libraryManager, ILogger<RatioCacheService> logger)
        {
            _libraryManager = libraryManager;
            _logger = logger;
            Instance = this;
        }

        public bool IsCacheValid(Guid parentId)
        {
            if (!_cacheTimestamps.TryGetValue(parentId, out var ts)) return false;
            var ttl = Plugin.Instance?.Configuration.CacheTtlHours ?? 24;
            return DateTime.UtcNow - ts < TimeSpan.FromHours(ttl);
        }

        public Dictionary<Guid, MasonryItemCacheEntry>? GetCache(Guid parentId)
        {
            if (!IsCacheValid(parentId)) return null;
            return _cache.TryGetValue(parentId, out var data) ? data : null;
        }

        public async Task ScanLibrary(Guid parentId, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Masonry: Scanning library {ParentId}", parentId);

            var query = new InternalItemsQuery
            {
                ParentId = parentId,
                Recursive = true,
                IncludeItemTypes = new[]
                {
                    BaseItemKind.Photo,
                    BaseItemKind.Video,
                    BaseItemKind.Movie,
                    BaseItemKind.Episode
                }
            };

            var items = _libraryManager.GetItemList(query);
            var ratios = new Dictionary<Guid, MasonryItemCacheEntry>();

            foreach (var item in items)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var ratio = GetAspectRatio(item);
                if (ratio.HasValue)
                {
                    ratios[item.Id] = new MasonryItemCacheEntry
                    {
                        Ratio = ratio.Value,
                        IsPhoto = item.MediaType == MediaType.Photo
                    };
                }
            }

            _cache[parentId] = ratios;
            _cacheTimestamps[parentId] = DateTime.UtcNow;

            _logger.LogInformation("Masonry: Cached {Count} items for library {ParentId}", ratios.Count, parentId);

            await Task.CompletedTask;
        }

        public async Task ScanAllLibraries(CancellationToken cancellationToken)
        {
            var libraries = _libraryManager.GetUserRootFolder().Children.ToList();

            foreach (var library in libraries)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await ScanLibrary(library.Id, cancellationToken);
            }
        }

        public void InvalidateCache(Guid parentId)
        {
            _cache.TryRemove(parentId, out _);
            _cacheTimestamps.TryRemove(parentId, out _);
        }

        public void InvalidateAllCaches()
        {
            _cache.Clear();
            _cacheTimestamps.Clear();
        }

        private double? GetAspectRatio(BaseItem item)
        {
            // Fuer Videos ist die eigentliche Stream-Groesse meist die bessere Quelle
            // als das generierte Vorschaubild, damit Hochkant-Videos auch als Hochkant
            // im Masonry auftauchen.
            if (item is Video video)
            {
                var mediaStreams = video.GetMediaStreams();
                var videoStream = mediaStreams?.FirstOrDefault(s => s.Type == MediaStreamType.Video);
                if (videoStream?.Width > 0 && videoStream?.Height > 0)
                {
                    return (double)videoStream.Width / videoStream.Height;
                }
            }

            // Fuer Fotos und als Fallback bei Videos nehmen wir weiterhin die Bildgroesse.
            if (item.HasImage(ImageType.Primary))
            {
                var image = item.GetImageInfo(ImageType.Primary, 0);
                if (image?.Width > 0 && image?.Height > 0)
                {
                    return (double)image.Width / image.Height;
                }
            }

            return null;
        }
    }
}
