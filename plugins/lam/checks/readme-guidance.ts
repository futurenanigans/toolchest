// The README guidance: what a README should carry, delivered on the first README edit of a session.
import { type Check, isBlank, isEditOrWrite } from './text'

export const isReadme = (path: string | undefined): boolean =>
  !isBlank(path) && /^readme\.md$/i.test(path.replaceAll('\\', '/').replace(/^.*\//, ''))

export const readmeGuidance: Check = {
  name: 'readme-guidance',
  guidance: true,
  advise: ({ tool, filePath, isFirstReadmeEdit }) => {
    if (!isEditOrWrite(tool) || !isReadme(filePath)) return null
    if (!isFirstReadmeEdit) return null
    return README_GUIDANCE
  },
}

const README_GUIDANCE = `README guidance. The job of this file is to get a reader from "what is this" to running code, and nothing else.

The list below is not a checklist to fill in. Write a section only where this project has something real to say under it, and read the answer out of the repo rather than recalling it. A heading with invented or padded content under it costs the reader more than a missing heading does.

Candidate sections, in the order they earn their place:
- What the project does and why it exists, in a line or two. The "why" heads off "why not just use X".
- Prerequisites and external dependencies that actually gate a first run (toolchain version, database, message broker, Docker).
- Clone, restore, build, run as literal copy-pasteable commands.
- A minimal working example: the smallest snippet that does something useful. Usually the highest-value section in the file, and often the only one a reader reaches. Link it to a compiled call site (a test, a sample project) where one exists, so the build catches the snippet going stale instead of a reader catching it.
- Configuration a reader cannot start without, pointing at an example config file for the full set.
- Further usage examples, where the API surface is non-obvious (fluent builders, middleware or plugin registration, dependency wiring).
- Project layout, only where it is non-standard or spans several projects. Give the top-level split and the convention that decides where new code goes, which is the part that constrains a contributor.
- How to run the tests, plus any setup they need (test containers, local DB).
- Contributing conventions, where others touch the repo.

Prefer content that stays true after the next commit, and keep this file off the maintenance path of ordinary development. Adding a folder, renaming a class, or taking a package reference must not require an edit here. So do not enumerate folder names, file names, types, or the packages a project consumes; state the convention that governs them and let the reader read the specifics from the repo. What a repo publishes is a separate matter from what it contains: the packages a library ships are its public contract, and adding one is a deliberate release rather than a routine commit, so name them and say what each is for. Name a version only where it gates a first run, and link the source of truth instead of copying values out of a project manifest or config file.

Leave out entirely:
- Full API documentation. Generated API docs own that.
- Changelog. That is CHANGELOG.md.
- Architecture rationale and ADRs. Link to /docs/adr/ instead of burying the getting-started content.
- Screenshots of code. Paste a fenced block.
- An inventory of the packages a project consumes. That list already lives in the project manifest. Call out a dependency only where its presence needs explaining. Packages the repo publishes are the opposite case and belong here.
- Deployment secrets, connection strings, and infra topology. Those live in the internal runbook.
- A license section in a private repo.

Two litmus tests. Could someone who cloned this cold get something running in under five minutes, and find every claim in the file still true when they did? And does any routine change to the code force an edit here? Content that fails the second one is too specific to be worth carrying.`
