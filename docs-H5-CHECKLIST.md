# H5 Regression Checklist (Admin)

## Devices / Viewports
- 320x568
- 360x800
- 390x844

## Pages
- /admin/matches
- /admin/anchors
- /admin/reviews
- /admin/timeline
- /admin/config

## Visual checks
- No horizontal overflow (body width <= viewport)
- No clipped buttons / text overlaps
- Bottom nav stays single-row horizontal
- Tap target >= 44px for key action buttons
- Long text wraps (no off-screen content)

## Functional checks
- Login -> switch tabs -> no white screen
- Matches filter / pagination works
- Anchors CRUD + reset password + delete works
- Reviews load list + approve/reject works
- Timeline sorting/status/countdown works
- Admin config create/disable/reset/delete works

## API / Data checks
- Confirm create/update/delete persisted in DB
- No null rendering crash (nickname/phone/wechat/qq)
- No repeated request storms in console/network

## Release checks
- Build assets are hashed
- index.html responds with no-store
- /assets responds with long cache (immutable)
