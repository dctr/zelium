import { isConflictError } from './api';
import type { PageDocument, SavePageRequest } from './types';

export type AutosaveState = 'saved' | 'dirty' | 'saving' | 'invalid' | 'conflict';

export type AutosaveSnapshot = {
  state: AutosaveState;
  etag: string;
  error: string;
};

export type AutosaveDraft = Pick<PageDocument, 'rootId' | 'path' | 'frontmatter' | 'body' | 'etag'>;

export type AutosaveUpdate = Partial<Pick<AutosaveDraft, 'frontmatter' | 'body'>> & {
  frontmatterValid?: boolean;
};

export type CreateAutosaveControllerOptions = {
  document: AutosaveDraft;
  save: (payload: SavePageRequest) => Promise<PageDocument>;
  delayMs?: number;
  onChange?: (snapshot: AutosaveSnapshot) => void;
};

export class AutosaveController {
  readonly #save: (payload: SavePageRequest) => Promise<PageDocument>;
  readonly #delayMs: number;
  readonly #onChange: (snapshot: AutosaveSnapshot) => void;

  #draft: AutosaveDraft;
  #saved: AutosaveDraft;
  #frontmatterValid = true;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #version = 0;
  #snapshot: AutosaveSnapshot;

  constructor(options: CreateAutosaveControllerOptions) {
    this.#save = options.save;
    this.#delayMs = options.delayMs ?? 600;
    this.#onChange = options.onChange ?? (() => {});
    this.#draft = { ...options.document };
    this.#saved = { ...options.document };
    this.#snapshot = { state: 'saved', etag: options.document.etag, error: '' };
  }

  get snapshot(): AutosaveSnapshot {
    return { ...this.#snapshot };
  }

  reset(document: AutosaveDraft): void {
    this.dispose();
    this.#draft = { ...document };
    this.#saved = { ...document };
    this.#frontmatterValid = true;
    this.#version = 0;
    this.#setSnapshot({ state: 'saved', etag: document.etag, error: '' });
  }

  update(update: AutosaveUpdate): void {
    if (this.#snapshot.state === 'conflict') {
      return;
    }

    this.#version += 1;
    this.#draft = { ...this.#draft, ...withoutValidity(update) };

    if (typeof update.frontmatterValid === 'boolean') {
      this.#frontmatterValid = update.frontmatterValid;
    }

    if (!this.#frontmatterValid) {
      this.#clearTimer();
      this.#setSnapshot({ state: 'invalid', etag: this.#draft.etag, error: 'Invalid frontmatter' });
      return;
    }

    if (this.#isClean()) {
      this.#clearTimer();
      this.#setSnapshot({ state: 'saved', etag: this.#draft.etag, error: '' });
      return;
    }

    this.#setSnapshot({ state: 'dirty', etag: this.#draft.etag, error: '' });
    this.#scheduleSave();
  }

  async flush(): Promise<void> {
    this.#clearTimer();

    if (!this.#frontmatterValid) {
      this.#setSnapshot({ state: 'invalid', etag: this.#draft.etag, error: 'Invalid frontmatter' });
      return;
    }

    if (this.#snapshot.state === 'conflict' || this.#isClean()) {
      return;
    }

    const versionAtSaveStart = this.#version;
    const payload: SavePageRequest = {
      rootId: this.#draft.rootId,
      path: this.#draft.path,
      frontmatter: this.#draft.frontmatter,
      body: this.#draft.body,
      etag: this.#draft.etag,
    };

    this.#setSnapshot({ state: 'saving', etag: this.#draft.etag, error: '' });

    try {
      const savedDocument = await this.#save(payload);
      this.#draft = { ...this.#draft, etag: savedDocument.etag };
      this.#saved = { ...payload, etag: savedDocument.etag };

      if (this.#version === versionAtSaveStart) {
        this.#setSnapshot({ state: 'saved', etag: savedDocument.etag, error: '' });
        return;
      }

      this.#setSnapshot({ state: 'dirty', etag: savedDocument.etag, error: '' });
      this.#scheduleSave();
    } catch (error) {
      if (isConflictError(error)) {
        this.#clearTimer();
        this.#setSnapshot({ state: 'conflict', etag: this.#draft.etag, error: error.message });
        return;
      }

      this.#setSnapshot({ state: 'dirty', etag: this.#draft.etag, error: error instanceof Error ? error.message : 'Save failed' });
    }
  }

  dispose(): void {
    this.#clearTimer();
  }

  #scheduleSave(): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      void this.flush();
    }, this.#delayMs);
  }

  #clearTimer(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #isClean(): boolean {
    return this.#draft.frontmatter === this.#saved.frontmatter && this.#draft.body === this.#saved.body;
  }

  #setSnapshot(snapshot: AutosaveSnapshot): void {
    if (
      this.#snapshot.state === snapshot.state &&
      this.#snapshot.etag === snapshot.etag &&
      this.#snapshot.error === snapshot.error
    ) {
      return;
    }

    this.#snapshot = snapshot;
    this.#onChange(this.snapshot);
  }
}

export function createAutosaveController(options: CreateAutosaveControllerOptions): AutosaveController {
  return new AutosaveController(options);
}

function withoutValidity(update: AutosaveUpdate): Partial<Pick<AutosaveDraft, 'frontmatter' | 'body'>> {
  const { frontmatterValid: _frontmatterValid, ...draft } = update;
  return draft;
}
