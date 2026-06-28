using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace JellyfinMasonry.ScheduledTasks
{
    public class ScanRatiosTask : IScheduledTask
    {
        private readonly RatioCacheService _cacheService;
        private readonly ILogger<ScanRatiosTask> _logger;

        public ScanRatiosTask(RatioCacheService cacheService, ILogger<ScanRatiosTask> logger)
        {
            _cacheService = cacheService;
            _logger = logger;
        }

        public string Name => "Masonry: Scan Aspect Ratios";
        public string Key => "MasonryScanRatios";
        public string Description => "Scans all libraries and caches image aspect ratios for Masonry layout";
        public string Category => "Masonry Layout";

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Masonry: Starting aspect ratio scan");
            progress.Report(0);

            await _cacheService.ScanAllLibraries(cancellationToken);

            progress.Report(100);
            _logger.LogInformation("Masonry: Aspect ratio scan complete");
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.DailyTrigger,
                    TimeOfDayTicks = TimeSpan.FromHours(3).Ticks
                },
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.IntervalTrigger,
                    IntervalTicks = TimeSpan.FromHours(6).Ticks
                }
            };
        }
    }
}
