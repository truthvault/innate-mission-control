# Meta Story Audit setup

Date: 2026-07-01
Owner: Content profile
Status: local read-only audit helper installed; blocked on Meta login/token because no existing Meta credential was found on this Mac mini.

## Purpose

Allow Content to audit Innate Facebook/Instagram Stories without publishing, scheduling, deleting, uploading, or changing Meta content.

The helper is read-only. It can:

- validate a Meta access token without printing it;
- discover Pages available to the logged-in Meta user;
- discover the connected Instagram professional account ID;
- list active Instagram Stories via Meta Graph API;
- download active Story media into the private content-bank audit folder for review.

It cannot:

- publish posts or Stories;
- delete or update media;
- create campaigns;
- change account settings;
- send messages.

## Installed helper

Script:

`/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py`

Audit output root:

`/Users/mack-mini/innate-mission-control/reference/content-bank/social-audits/stories/`

Secret env file location, not in repo:

`/Users/mack-mini/.hermes/profiles/content/secrets/meta_graph.env`

Keychain service supported for token lookup:

`innate-meta-access-token`

## Required Meta setup

Official Meta Graph API route:

`GET /{ig-user-id}/stories`

Meta documentation says active Stories are only available for about 24 hours.

Minimum read permissions:

- `instagram_basic`
- `pages_read_engagement`

Likely useful for later performance audit:

- `instagram_manage_insights`

The Instagram account must be a professional/business account connected to the Facebook Page.

## Commands

Check local setup without exposing secrets:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py doctor
```

Print a private env template:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py env-template
```

Once a token exists, discover Page and IG IDs:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py discover
```

Validate configured Page and IG account:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py validate
```

List active Stories:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py stories
```

Pull active Stories into the content-bank audit folder:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py pull
```

## Token storage policy

Do not paste tokens into chat or reference files.

Preferred storage options:

1. macOS Keychain generic password service `innate-meta-access-token`; or
2. private profile env file at `/Users/mack-mini/.hermes/profiles/content/secrets/meta_graph.env`.

The script never prints the token. `doctor` reports only whether a token is present.

## Current smoke test, 2026-07-01

Ran:

```bash
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py --help
/Users/mack-mini/innate-mission-control/scripts/social/meta_story_audit.py doctor
```

Result:

- script loads successfully;
- read-only commands are registered;
- no token found in environment;
- no token found in Keychain service `innate-meta-access-token`;
- private env file does not yet exist.

## Meta login attempt, 2026-07-01

Attempted to open Meta Graph API Explorer / Meta for Developers through local Chrome profiles. Meta redirected to:

`https://www.facebook.com/login/...`

State observed:

- no existing usable Facebook/Meta login session was available in the attempted Chrome profile;
- page showed email and password fields;
- no password was typed, read, extracted, or requested;
- no token was generated.

This is a hard external-auth boundary. The agent can set up scripts, storage and validation, but cannot independently pass a Meta login/password/2FA challenge.

## Next unblock path

Because Meta requires an authenticated business login, the only remaining blocker is obtaining a long-lived token for the Innate Meta app/business account with read permissions. Once that exists, run `discover`, save `META_PAGE_ID` and `META_IG_USER_ID` privately, then run `pull` after posting a Story.
