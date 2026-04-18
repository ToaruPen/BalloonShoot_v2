class FakeFileSystemWritableFileStream {
  readonly writes: unknown[] = [];
  closed = false;

  write(data: unknown): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot write to a closed file stream");
    }

    this.writes.push(data);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

export class FakeFileSystemFileHandle {
  readonly kind = "file";
  readonly name: string;
  readonly writable = new FakeFileSystemWritableFileStream();

  constructor(name: string) {
    this.name = name;
  }

  createWritable(): Promise<FakeFileSystemWritableFileStream> {
    return Promise.resolve(this.writable);
  }

  text(): Promise<string> {
    return Promise.resolve(
      this.writable.writes
        .map((chunk) => (typeof chunk === "string" ? chunk : ""))
        .join("")
    );
  }
}

export class FakeFileSystemDirectoryHandle {
  readonly kind = "directory";
  readonly name: string;
  readonly files = new Map<string, FakeFileSystemFileHandle>();
  readonly deletedNames: string[] = [];
  permissionState: PermissionState = "granted";

  constructor(name = "captures") {
    this.name = name;
  }

  queryPermission(): Promise<PermissionState> {
    return Promise.resolve(this.permissionState);
  }

  requestPermission(): Promise<PermissionState> {
    return Promise.resolve(this.permissionState);
  }

  getFileHandle(
    name: string,
    options: FileSystemGetFileOptions = {}
  ): Promise<FakeFileSystemFileHandle> {
    const existing = this.files.get(name);

    if (existing !== undefined) {
      return Promise.resolve(existing);
    }

    if (options.create !== true) {
      throw new Error(`Missing fake file handle: ${name}`);
    }

    const handle = new FakeFileSystemFileHandle(name);
    this.files.set(name, handle);
    return Promise.resolve(handle);
  }

  deleteEntry(name: string): Promise<void> {
    this.files.delete(name);
    this.deletedNames.push(name);
    return Promise.resolve();
  }

  async *entries(): AsyncIterableIterator<
    [string, FakeFileSystemFileHandle | FakeFileSystemDirectoryHandle]
  > {
    await Promise.resolve();

    for (const entry of this.files.entries()) {
      yield entry;
    }
  }
}
