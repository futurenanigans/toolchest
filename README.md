# toolchest

Claude Code plugin marketplace. Add it with `/plugin marketplace add futurenanigans/toolchest`, then install plugins from `/plugin`.

Each plugin lives under `plugins/`. Rules ship in a plugin's `rules/` folder beside the skills that reference them.

The global standards are not a plugin. [`claude-md/CLAUDE.md`](claude-md/CLAUDE.md) is the user-level `CLAUDE.md` these plugins assume; copy it to `~/.claude/CLAUDE.md`. Its rules section maps each rule to the plugin that ships it.

The `awl` plugin is a release archive from [awl-dist](https://github.com/futurenanigans/awl-dist), pinned by sha256. It carries `awl.dll` and runs it with `dotnet`, so it needs the .NET 10 runtime on PATH.

The `loom` plugin is a release archive from [loom-dist](https://github.com/futurenanigans/loom-dist), pinned by sha256. It runs on the machine's Bun, so it needs `bun` on PATH, and carries its engine, currently for linux-x64 (glibc) only.
