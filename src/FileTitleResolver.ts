import {TAbstractFile, TFile, Vault} from "obsidian";
import MetaTitleParser from "./MetaTitleParser";

type Item = {
	file: TFile,
	title: string,
	state: 'resolved' | 'process' | 'none',
	promise: Promise<string | null> | null
}
type Options = {
	metaPath: string
}
export default class FileTitleResolver {
	private collection: Map<string, Item>;

	constructor(
		private vault: Vault,
		private options: Options
	) {
		this.collection = new Map();
		this.bind();
	}

	public isResolved(value: TAbstractFile | string): boolean {
		const path = value instanceof TAbstractFile ? value.path : value;
		return this.collection.get(path)?.state === 'resolved';
	}

	public getResolved(value: TAbstractFile | string): string | null {
		const path = value instanceof TAbstractFile ? value.path : value;
		return this.collection.get(path)?.title ?? null;
	}

	public async resolveTitle(abstract: TAbstractFile | string): Promise<string | null> {
		const item = abstract instanceof TAbstractFile
			? this.getOrCreate(abstract)
			: this.getOrCreateByPath(abstract);
		return item ? this.resolve(item) : null;

	}

	private getOrCreateByPath(path: string): Item | null {
		if (!this.collection.has(path)) {
			this.getOrCreate(this.vault.getAbstractFileByPath(path));
		}
		return this.collection.get(path);
	}

	private async resolve(item: Item): Promise<string | null> {
		switch (item.state) {
			case 'resolved':
				return item.title;
			case "process":
				return item.promise;
			case "none": {
				item.state = 'process';
				item.promise = new Promise<string>(async (r) => {
					const content = await item.file.vault.read(item.file);
					let title = await MetaTitleParser.parse(this.options.metaPath, content);

					if (title === null || title === '') {
						title = null;
					}

					item.title = title;
					item.state = 'resolved';
					item.promise = null;
					r(item.title);
				});
				return await item.promise;
			}
		}

	}


	private getOrCreate(abstract: TAbstractFile): Item | null {
		if (abstract instanceof TFile) {
			if (!this.collection.has(abstract.path)) {
				this.collection.set(abstract.path, {
					file: abstract,
					title: null,
					state: 'none',
					promise: null
				});
			}
			return this.collection.get(abstract.path);
		}

		return null;
	}

	private bind(): void {
		this.vault.on('modify', (file) => {
			const item = this.collection.get(file.path);
			if (item) {
				item.state = 'none';
			}
		});
		this.vault.on('delete', (f) => {
			this.collection.delete(f.path);
		});
	}

}