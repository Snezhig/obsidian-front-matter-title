import {debounce, Plugin, TAbstractFile} from 'obsidian';
import Resolver from "./src/Title/Resolver/Resolver";
import {Settings, SettingsTab} from "./src/Settings";
import Composer, {ManagerType} from "./src/Title/Manager/Composer";
import FrontMatterParser from "./src/Title/FrontMatterParser";
import VaultFacade from "./src/Obsidian/VaultFacade";


export default class MetaTitlePlugin extends Plugin {
    public settings: Settings;
    private resolver: Resolver;
    private composer: Composer = null;
    private parser: FrontMatterParser;


    public async saveSettings() {
        const settings = this.settings.getAll();
        await this.saveData(settings);

        //TODO: refactor
        if (
            settings.list_pattern === true && this.parser.getDelimiter() !== null
            || settings.list_pattern !== true && settings.list_pattern !== this.parser.getDelimiter()
        ) {
            this.parser.setDelimiter(settings.list_pattern === true ? null : settings.list_pattern);
            this.resolver.revokeAll();
        }

        this.resolver.changePath(settings.path);
        this.resolver.setExcluded(settings.excluded_folders);
        this.composer.setState(settings.m_graph, ManagerType.Graph);
        this.composer.setState(settings.m_explorer, ManagerType.Explorer);
        this.composer.setState(settings.m_markdown, ManagerType.Markdown);
        this.composer.setState(settings.m_quick_switcher, ManagerType.QuickSwitcher);
        await this.runManagersUpdate();
    }

    public async onload() {
        this.saveSettings = debounce(this.saveSettings, 500, true) as unknown as () => Promise<void>

        this.settings = new Settings(await this.loadData(), this.saveSettings.bind(this));
        this.bind();

        this.parser = new FrontMatterParser();
        this.resolver = new Resolver(
            this.app.metadataCache,
            this.parser,
            new VaultFacade(this.app.vault),
            {
                metaPath: this.settings.get('path'),
                excluded: this.settings.get('excluded_folders')
            });
        this.resolver.on('unresolved', debounce(() => this.onUnresolvedHandler(), 200));

        this.composer = new Composer(this.app.workspace, this.resolver);
        this.app.workspace.onLayoutReady(() => {
            this.composer.setState(this.settings.get('m_graph'), ManagerType.Graph);
            this.composer.setState(this.settings.get('m_explorer'), ManagerType.Explorer);
            this.composer.setState(this.settings.get('m_markdown'), ManagerType.Markdown)
            this.composer.setState(this.settings.get('m_quick_switcher'), ManagerType.QuickSwitcher)
            this.composer.update();
        });

        this.addSettingTab(new SettingsTab(this.app, this));
    }

    public onunload() {
        this.composer.setState(false);
        this.resolver.removeAllListeners('unresolved');
    }

    private bind() {
        this.registerEvent(this.app.metadataCache.on('changed', file => {
            this.resolver?.revoke(file);
            this.runManagersUpdate(file).catch(console.error)
        }));
        this.app.workspace.onLayoutReady(() =>
            this.registerEvent(this.app.vault.on('rename', (e, o) => {
                this.resolver?.revoke(o);
                this.runManagersUpdate(e).catch(console.error);
            }))
        );
    }


    private async runManagersUpdate(file: TAbstractFile = null): Promise<void> {
        await this.composer.update(file);
    }


    private async onUnresolvedHandler(): Promise<void> {
        await this.runManagersUpdate();
    }
}
