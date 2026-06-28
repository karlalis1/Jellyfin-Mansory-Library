using System;
using System.Collections.Generic;
using JellyfinMasonry.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace JellyfinMasonry
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        public override string Name => "Masonry Layout";
        public override Guid Id => Guid.Parse("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
        public override string Description => "Caches image aspect ratios for Masonry layout support";

        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
        }

        public static Plugin? Instance { get; private set; }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return Array.Empty<PluginPageInfo>();
        }
    }
}
