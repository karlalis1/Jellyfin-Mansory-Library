using MediaBrowser.Model.Plugins;

namespace JellyfinMasonry.Configuration
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>
        /// Cache TTL in hours.
        /// </summary>
        public int CacheTtlHours { get; set; } = 24;

        /// <summary>
        /// Auto-refresh cache after library scan.
        /// </summary>
        public bool AutoRefreshAfterScan { get; set; } = true;
    }
}
