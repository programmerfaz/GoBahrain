# Optional: Local thobe / kandura / abaya avatars

The app currently uses a mix of:

- **Public-domain illustrations** (FreeSVG): Arab man in thawb, Muslim man in traditional dress.
- **Cartoon avatars** (DiceBear): turban + white clothing (thobe-style) and hijab + white (abaya-style).

To use **your own** thobe, kandura, or abaya cartoon images (e.g. from a designer or stock site):

1. Add 12 PNG or JPG files here, e.g. `1.png` … `12.png`.
2. In `src/constants/avatars.js`, switch to using local requires and export an array of `require('./path/to/1.png')` etc., and in SignUpScreen store the avatar index (e.g. `"0"`) instead of a URL when saving the user profile.

This folder is optional; the app works with the default URLs above.
