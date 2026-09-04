# Notices

`notices.json` is what the manager draws as a banner under the status line on Home. The app
reads it raw from the default branch, so that URL is the contract, and a notice is a reviewed
change: it ships by merging a pull request, without a release.

A notice is one line that has to be seen: a game patch broke the patcher, an update is required,
a build has a bug worth knowing about. Anything longer is a post in the Announcements category
of the repository's Discussions, which Home lists as news.

## Schema 1

```json
{
  "schema": 1,
  "notices": [
    {
      "id": "2026-09-patch-26-9",
      "severity": "warning",
      "title": "Patch 26.9: the patcher takes longer to hook",
      "url": "https://github.com/LeagueToolkit/ltk-manager/discussions/220",
      "publishedAt": "2026-09-01T12:00:00Z",
      "expiresAt": "2026-09-20T00:00:00Z",
      "versions": "<1.16.0"
    }
  ]
}
```

| Field         | Required | What it is                                                                  |
| ------------- | -------- | --------------------------------------------------------------------------- |
| `id`          | yes      | Stable across edits. A dismissal is kept by it, so a reworded notice stays  |
|               |          | dismissed, and a new id is a new notice                                     |
| `severity`    | yes      | `info`, `warning` or `danger`                                               |
| `title`       | yes      | The one line, in one language                                               |
| `url`         | no       | Where "What to do" opens                                                    |
| `publishedAt` | yes      | RFC 3339. Newest first on the page                                          |
| `expiresAt`   | no       | RFC 3339. Past it, the notice is not drawn, so a patch-day warning does not |
|               |          | outlive the patch                                                           |
| `versions`    | no       | A semver range. A build outside it does not draw the notice, so a "please   |
|               |          | update" notice is silent on the build that has                              |

A build reads schema 1 and nothing else. A document on another schema is an empty list to it,
so a new schema is a new build first and a new document second.
