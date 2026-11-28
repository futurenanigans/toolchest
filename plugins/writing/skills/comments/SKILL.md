---
name: comments
description: Which code comments may exist. A short module doc, a constraint comment that names its test, and a doc comment on public API that tooling shows to callers. Load before writing, editing or reviewing any code comment or doc comment.
---

# Comments

Code here is written and read by agents, and an agent treats every comment as a claim to verify, update or obey, so a comment that only restates the code is a cost. Write only three kinds:

1. A module doc: one short paragraph at the top of a file saying what it is responsible for, so a reader can decide whether to read the rest.
2. A constraint comment the code cannot express, carrying its anchor: the name of the test that keeps it true. A link or issue number is not an anchor; it records where a claim came from and proves nothing about the code beside it. When no test can pin the constraint, encode it in the code (a named constant, a type, a guard) instead of a comment.
3. A public API doc: a doc comment in the form the language's tooling reads (`///` in C# and Rust, TSDoc, a Python docstring) on a declaration that code outside its package calls. An IDE shows it at the call site and a documentation generator publishes it, so it says what a caller cannot read from the name and signature: what the member does in one sentence, the units and valid ranges of its inputs, and when it fails. It never describes the implementation or how the code came to be, and it uses the sections and tags the language's tooling renders.

Public API is the surface a published package exposes to other codebases: the items a library crate exports, the public and protected members of a packaged assembly, the exports of a package's entry points. A `public` class inside an application, and an item only its own workspace or solution can reach, are internal and carry no doc comment.

Delete every other comment in lines you touch: doc comments on internal items, inline explanations, history, banners, commented-out code. A section a compiler or lint requires stays wherever it is required, such as `# Safety` on a Rust `unsafe fn`. Where an analyzer enforces the comment policy (the comment rules in awl and loom, or Mortise, a Rust analyzer distributed outside this marketplace), its finding is the rule.
