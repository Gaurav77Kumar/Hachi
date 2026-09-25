# Hachi — Privacy Policy

_Last updated: September 25, 2026_

Hachi replaces detected advertising slots on the pages you visit with images of
public-domain artworks.

Hachi has no account system, analytics service, or Hachi-operated backend.
Settings, favorites, collections, photos, and activity statistics are stored in
the browser's local extension storage.

## What the extension stores on your device

- Extension settings, including enabled state, style, appearance, and site disables
- Replacement counters, viewing-time history, discoveries, and curator milestones
- Favorites and user-created collections
- Up to seven personal photos you explicitly choose to upload

## Network activity

Artwork images and weekly-card thumbnail metadata are retrieved from Wikimedia
Commons and its image infrastructure. These requests include the artwork
filename or image URL needed to retrieve the selected file. Hachi uses
`no-referrer` for content-card image requests, but the receiving service may
still process ordinary network information such as an IP address.

Hachi does not intentionally send page text, browsing history, page URLs, or
extension settings to Wikimedia.

## What we don't do

- We don't collect, sell, or share browsing data.
- We don't use accounts, analytics, trackers, or remote JavaScript code.
- We don't intentionally transmit the content of pages you visit.

## Permissions

| Permission | Why it is used |
| --- | --- |
| HTTP/HTTPS page access | The content script inspects ordinary web pages for likely ad slots and inserts artwork cards. |
| `storage` | Keeps settings, favorites, collections, photos, and local activity statistics on your device. |
| `activeTab` | Lets the popup identify the current site for the per-site disable control. |

## Data removal

- Disabling Hachi stops future replacements but does not delete stored data.
- Removing the extension from Chrome deletes its local extension storage,
  including settings, collections, photos, and activity history.
- Removing individual site disables or photos updates local data immediately.
