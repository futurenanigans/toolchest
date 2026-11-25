# toolchest

Claude Code plugin marketplace. Add it with `/plugin marketplace add futurenanigans/toolchest`, then install plugins from `/plugin`.

Each plugin lives under `plugins/`. Rules ship in a plugin's `rules/` folder beside the skills that reference them.

The global standards are not a plugin. [`claude-md/CLAUDE.md`](claude-md/CLAUDE.md) is the user-level `CLAUDE.md` these plugins assume; copy it to `~/.claude/CLAUDE.md`. Its rules section maps each rule to the plugin that ships it.

The `awl` plugin runs the awl .NET tool, which ships separately: install it with the two commands in [awl-dist](https://github.com/futurenanigans/awl-dist) before enabling the plugin.
