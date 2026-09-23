# Workshop source map

Workshop code is grouped by feature, then by responsibility. Components, hooks,
state, API calls, and utilities live under the feature that owns them. Tests sit
in `__tests__` beside the code they cover.

| Feature                   | Owns                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `projects/`               | Project grid, filters, selection, creation, and project details     |
| `imports/`                | Fantome, Modpkg, and Git imports                                    |
| `packing/`                | Pack actions and dialogs                                            |
| `testing/`                | Project test sessions and their controls                            |
| `content/`                | Project files, content trees, and content sidebar                   |
| `layers/`                 | Layer editing, file drops, and WAD imports                          |
| `shell/`                  | Editor layout, document leaves, navigation history, and persistence |
| `documents/`              | Document identities and editor registration                         |
| `explorer/`               | Shared explorer views, navigation, selection, and sorting           |
| `gameBrowser/`            | Installed game files and archives                                   |
| `gameBrowser/extraction/` | Extraction plans, actions, dialogs, and progress                    |
| `objectsBrowser/`         | Object index lifecycle, queries, and browsing                       |
| `references/`             | Reference search and browsing                                       |
| `preview/`                | Asset previews and image request scheduling                         |
| `palette/`                | Command search, ranking, and navigation controls                    |
| `sidebar/`                | Sidebar panels and rails                                            |
| `problems/`               | Project analysis, validation, and repair actions                    |
| `ignore-rules/`           | Ignore-rule editing                                                 |
| `string-overrides/`       | String lookup and override editing                                  |
| `text-files/`             | Project text documents and saving                                   |
| `bin/`                    | Bin editing and the VFX engine. See [its source map](bin/README.md) |
| `shared/`                 | Cross-feature tree primitives, utilities, and query keys            |

A feature only has the responsibility folders it needs:

```text
feature/
|-- api/
|-- components/
|   |-- __tests__/
|-- hooks/
|-- state/
|-- utils/
```

The root `index.ts` remains the public workshop entry point. The top-level `api/`,
`components/`, `hooks/`, and `state/` entry points preserve existing exports. Their
implementations live in the feature folders. The aggregate query and mutation
objects also remain available, while feature consumers call their own APIs.

Query keys, persisted store shapes, and runtime behavior stay unchanged by this
folder refactor.
