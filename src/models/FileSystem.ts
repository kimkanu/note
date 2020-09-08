const FILENAME_PREFIX = "__NOTE_KANU_KIM_FILE_SYSTEM__";

export class FileSystem {
  index: Set<string>;
  cache: { [name: string]: string };

  constructor() {
    this.index = this.getIndex();
    this.cache = {};
  }

  getIndex(): Set<string> {
    const INDEX_PATH = `${FILENAME_PREFIX}/index`;
    const indexString = localStorage.getItem(INDEX_PATH);
    if (indexString === null) {
      localStorage.setItem(INDEX_PATH, "[]");
      return new Set();
    }
    try {
      const indexArray: string[] = JSON.parse(indexString);
      if (Array.isArray(indexArray)) {
        return new Set(
          indexArray
            .filter((s) => s.startsWith(FILENAME_PREFIX))
            .map((s) => s.slice(FILENAME_PREFIX.length + 1, -4))
        );
      }
      return new Set();
    } catch {
      localStorage.setItem(INDEX_PATH, "[]");
      return new Set();
    }
  }

  get current(): string | null {
    const filename = localStorage.getItem(`${FILENAME_PREFIX}/current`);
    return filename || null;
  }

  setCurrent(filename: string | null) {
    localStorage.setItem(`${FILENAME_PREFIX}/current`, filename ?? "");
  }

  getFile(filename: string): string | null {
    if (!this.index.has(filename)) {
      return null;
    }
    if (this.cache[filename]) {
      return this.cache[filename];
    }
    this.cache[filename] =
      localStorage.getItem(`${FILENAME_PREFIX}/${filename}.mdx`) ?? "";
    return this.cache[filename];
  }

  createFile(filename: string): boolean {
    if (this.index.has(filename)) {
      return false;
    }
    console.log("created");
    this.index.add(filename);
    this.cache[filename] = "";
    localStorage.setItem(`${FILENAME_PREFIX}/${filename}.mdx`, "");
    localStorage.setItem(
      `${FILENAME_PREFIX}/index`,
      JSON.stringify(
        Array.from(this.index).map(
          (filename) => `${FILENAME_PREFIX}/${filename}.mdx`
        )
      )
    );

    return true;
  }

  updateFile(filename: string, content: string): boolean {
    if (!this.index.has(filename)) {
      const created = this.createFile(filename);
      if (!created) {
        return false;
      }
    }
    this.cache[filename] = content;
    localStorage.setItem(`${FILENAME_PREFIX}/${filename}.mdx`, content);
    return true;
  }
}
