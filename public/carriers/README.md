# Carrier logos

Drop insurance carrier logo images in this folder (PNG or SVG work best —
use a transparent background if you have one, like the Travelers logo).

## Naming

Name each file after the carrier, lowercase, spaces replaced with hyphens,
matching the company name in the "Insurance Companies" admin page:

```
travelers.png
progressive.png
mercury.png
chubb.png
```

Once a logo is here, it's served at `/carriers/<filename>`, e.g.:

```
https://<your-app>/carriers/travelers.png
```

Let Claude know once you've added some and want them wired up in the UI
(e.g. shown next to the company name in the SOP library, search results,
or the Insurance Companies page) — that just needs a small code change to
match each company to its logo file.
