using JellyfinMasonry.ScheduledTasks;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.DependencyInjection;

namespace JellyfinMasonry
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            serviceCollection.AddSingleton<RatioCacheService>();
            serviceCollection.AddSingleton<IScheduledTask, ScanRatiosTask>();
        }
    }
}
