# Version documents

Generates a plain Mojang `version.json` for every Forge build, and publishes
them to this repository's GitHub Pages site. The wrapper jar and the documents
that name it are released together, which is why the generator lives beside it.

```
public/index.json                      every Minecraft version, its builds and their eras
public/versions/<mc>/<forgeId>.json    the document
public/versions/<mc>/{latest,recommended,best}.json
public/skipped.json                    builds that produced nothing, with the reason
```

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

## Reading five thousand installers

The documents worth having are tens of kilobytes inside installers that run
2–5 MB, and there are about five thousand installers. Downloading them all is
~20 GB; fetching each archive's central directory over an HTTP range request and
then just those two entries is ~650 MB. Forge's maven answers
`accept-ranges: bytes`, and `remote-zip.mjs` does the rest. Everything read is
cached under `.cache/`, so only the first run pays.

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
node src/index.mjs                  # everything
node src/index.mjs --mc 1.7.10      # one Minecraft version
node src/index.mjs --only 1.4.7-6.6.2.534
npm test
```

`FORGEWRAPPER_TAG` picks the release the documents name; `FORGEWRAPPER_JAR`
points at a locally built jar to hash instead of fetching that release, for
runs made before it exists.
