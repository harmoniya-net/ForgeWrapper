# ForgeWrapper

Allow a launcher to run any Forge version from a plain Mojang `version.json`.

A fork of [PrismLauncher/ForgeWrapper](https://github.com/PrismLauncher/ForgeWrapper),
which covers Minecraft 1.13+ by running Forge's installer in-process at launch.
This fork adds the era below it: 1.5.2 and older, where installing Forge meant
rewriting the client jar rather than running processors. Both eras end up as the
same thing from a launcher's point of view — a `version.json` whose `mainClass`
is this wrapper — so nothing outside has to know which era a build belongs to.

Nothing here reaches the network. Every input is a file the launcher has already
downloaded, named by a system property.

## Pre-1.13 (Minecraft 1.5.2 and older)

Two shapes, one operation:

- **1.5.2** ships an installer whose profile sets `stripMeta`. Forge's own classes
  are a normal library on the classpath; the client jar only needs its signature
  removed.
- **1.5.1 and older** ship a "universal" zip of loose class files meant to be
  copied into `minecraft.jar`, overwriting what was there — the original jar mod.

Both are the same job: overlay entries win, client entries fill in the rest,
`META-INF` is dropped. Dropping it is not tidiness — the vanilla client jar is
signed (1.5.2 carries `MOJANG_C.SF`/`.DSA`, 1.2.5 carries `CODESIGN.SF`/`.RSA`),
and a signed jar whose contents no longer match its signature fails to load with
a `SecurityException`. Hence the era's install instructions have always been
"delete the META-INF folder".

The patched jar is built once, on first launch, and rebuilt only when an input
is newer than it.

### Properties

| Property | |
|---|---|
| `forgewrapper.mainClass` | the class to hand off to. **Its presence selects this mode.** |
| `forgewrapper.minecraft` | the vanilla client jar to patch |
| `forgewrapper.patched` | where the patched jar goes |
| `forgewrapper.jarmod` | `File.pathSeparator`-separated archives to overlay, in order. Absent or empty means strip only (1.5.2). |

Arguments reach the real main class untouched — the wrapper is a shim, not a
launcher.

### Nothing is required of the launcher

The patched jar has to be reached *instead of* the vanilla one, not as well as
it — and a launcher that honours `inheritsFrom` always puts the inherited client
jar on `-cp`, with no way for the Mojang format to ask it not to. So the wrapper
does not negotiate: it builds a `URLClassLoader` holding the patched jar first,
the rest of `-cp` after it, and hands off inside that.

Order is what makes this correct. The patched jar is a superset of the vanilla
one, so nothing can resolve past it — which also covers the copy a launcher may
keep under a name of its own, such as `versions/<id>/<id>.jar`, that no check
could recognise.

That is also what LaunchWrapper expects. Its `Launch` casts its own loader to a
`URLClassLoader` to read the sources for `LaunchClassLoader` — a cast that fails
outright against the Java 9+ application loader.

## 1.13+

Unchanged from upstream: the wrapper runs Forge's own `PostProcessors` in-process,
then delegates to the real main class.

1. ForgeWrapper provides some java properties since 1.4.2:
   - `forgewrapper.librariesDir` : a path to libraries folder (e.g. -Dforgewrapper.librariesDir=/home/xxx/.minecraft/libraries)
   - `forgewrapper.installer` : a path to forge installer (e.g. -Dforgewrapper.installer=/home/xxx/forge-1.14.4-28.2.0-installer.jar)
   - `forgewrapper.minecraft` : a path to the vanilla minecraft jar (e.g. -Dforgewrapper.minecraft=/home/xxx/.minecraft/versions/1.14.4/1.14.4.jar)

2. ForgeWrapper also provides an interface [`IFileDetector`](https://github.com/ZekerZhayard/ForgeWrapper/blob/master/src/main/java/io/github/zekerzhayard/forgewrapper/installer/detector/IFileDetector.java), you can implement it and custom your own detecting rules. To load it, you should make another jar which contains `META-INF/services/io.github.zekerzhayard.forgewrapper.installer.detector.IFileDetector` within the full implementation class name and add the jar to class path.

## How to use (Outdated)

1. Download Forge installer for Minecraft 1.13+ [here](https://files.minecraftforge.net/).
2. Download ForgeWrapper jar file at the [release](https://github.com/ZekerZhayard/ForgeWrapper/releases) page.
3. Since ForgeWrapper 1.5.1, it no longer includes the json converter, so you need to build it by yourself:
   - [Download](https://github.com/ZekerZhayard/ForgeWrapper/archive/refs/heads/master.zip) ForgeWrapper sources.
   - Extract the zip and open terminal in the extracted folder.
   - Run `./gradlew converter:build` command in terminal and get the jar from `./converter/build/libs`
3. Run the below command in terminal:
   ```
   java -jar <ForgeWrapper.jar> --installer=<forge-installer.jar> [--instance=<instance-path>]
   ```
   *Notice: If you don't specify a MultiMC instance path, ForgeWrapper will create the instance folder in current working space.*

4. If the instance folder which just created is not in `MultiMC/instances` folder, you just need to move to the `MultiMC/instances` folder.
5. Run MultiMC, and you will see a new instance named `forge-<mcVersion>-<forgeVersion>`.