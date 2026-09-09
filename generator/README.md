# Version documents

Generates a plain Mojang `version.json` for every Forge and NeoForge build, and
publishes them to this repository's GitHub Pages site. The wrapper jar and the
documents that name it are released together, which is why the generator lives
beside it.

```
public/index.json                      every Minecraft version, its builds, and a URL for each
public/versions/<mc>/<forgeId>.json    the document
public/versions/<mc>/{latest,recommended,best}.json
public/skipped.json                    builds that produced nothing, with the reason

public/neoforge/…                      the same four, for NeoForge
```

The two indexes have the same shape, and differ in one field: a build is listed
as `{ "forge": … }` in Forge's and `{ "neoforge": … }` in NeoForge's. Forge's
spelling is fixed — consumers have been reading that key since before NeoForge
was published here.

The index carries no era. Nothing downstream is meant to branch on one — that
is the point of publishing a single document shape for all four — and a field
in the index is an invitation to. `SITE_BASE` sets the host the index's URLs
are absolute against.

There is no era in the output for a consumer to branch on. A launcher reads one
document, resolves `inheritsFrom` against Mojang's own, downloads the libraries
and starts `mainClass` — for a 2012 jar mod exactly as for a 2025 processor
build.

## What each era becomes

| Era | Builds | `mainClass` | What the document has to carry |
|---|---|---|---|
| `processor` | 1.13+ | the wrapper | the installer, so the wrapper can run Forge's processors |
| `legacy` | 1.6.1–1.12.2 | Forge's own | nothing special — libraries and arguments |
| `jarmod` | 1.5.2 | the wrapper | `forgewrapper.patched`: the signed client jar has to be rewritten |
| `ancient` | ≤1.5.1 | the wrapper | `forgewrapper.jarmod`: the universal zip to overlay |

The era is decided from the documents a build ships, never from its Minecraft
version — the installer arrives partway through 1.6.1, so two builds for the
same Minecraft version can belong to different eras. 1.12.2's last releases were
backported onto the new installer format and carry a `spec` with no processors,
which is why having a `spec` is not what makes a build a processor build.

## NeoForge

One era, not four: every NeoForge build is a processor install, so
`neoforge-index.mjs` is the Forge generator with the era machinery gone. It
shares `document.mjs` — the wrapper's arguments, the client-jar declaration,
the processor document — so a fix to any of those lands on both families.

Two things do differ:

**The version list is flat.** Forge's maven publishes `{ mc: [builds] }`;
NeoForge publishes 1700 versions in one array, so the grouping falls out of the
sweep rather than framing it, and a cold run reads every installer.

**The Minecraft version is read, never derived.** `21.1.172` does encode
1.21.1, and for years every version did. `26.2.0.84` carries four components
and targets Minecraft `26.2`, which has no leading `1.` at all. So the
generator takes `inheritsFrom` from the installer's own `version.json` and
never looks at the build id. There is likewise no promotions endpoint: a build
is a prerelease exactly when its version carries a qualifier (`20.4.80-beta`),
which is NeoForge's own published rule.

## Reading five thousand installers

The documents worth having are tens of kilobytes inside installers that run
2–5 MB, and there are about five thousand Forge installers and seventeen
hundred NeoForge ones. Downloading them all is ~20 GB; fetching each archive's
central directory over an HTTP range request and then just those two entries is
under a gigabyte. Both mavens answer `accept-ranges: bytes`, and
`remote-zip.mjs` does the rest. Everything read is cached under `.cache/`, so
only the first run pays.

## Two things the documents assert rather than read

**The vanilla client jar is declared as a library.** The wrapper has to be told
where that jar is and the Mojang format has no placeholder for it —
`${version_name}` names the Forge version, and every launcher lays out
`versions/` differently. Declaring it puts it at a path `${library_directory}`
can address. The cost is that a launcher honouring `inheritsFrom` fetches it
twice.

**Below 1.5.2 there is no Forge document at all**, so those documents are
written rather than extracted: `inheritsFrom`, the wrapper as `mainClass`, and
the overlay archive as a library. Derivable from the build id alone, but ours,
not Forge's.

## Running it

```
node src/index.mjs                  # every Forge build
node src/index.mjs --mc 1.7.10      # one Minecraft version
node src/index.mjs --only 1.4.7-6.6.2.534

node src/neoforge-index.mjs         # every NeoForge build
node src/neoforge-index.mjs --mc 1.21.1
node src/neoforge-index.mjs --only 21.1.172

npm test
```

A sliced run writes documents only: it leaves `index.json` and the
`{latest,recommended,best}.json` aliases as they were, since one build is no
evidence about which is newest.

`FORGEWRAPPER_TAG` picks the release the documents name; `FORGEWRAPPER_JAR`
points at a locally built jar to hash instead of fetching that release, for
runs made before it exists.
