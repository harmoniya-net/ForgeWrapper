package io.github.zekerzhayard.forgewrapper.installer.patch;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import io.github.zekerzhayard.forgewrapper.installer.util.ModuleUtil;

/**
 * The pre-1.13 half of the wrapper.
 *
 * Where the processor era has to run Forge's own installer to produce its
 * client jar, this era only has to rewrite one: strip the signature (1.5.2) or
 * overlay a universal zip and strip the signature (1.5.1 and older). Nothing
 * here reaches the network — every input is a file the launcher has already
 * placed on disk, named by a system property.
 *
 * <ul>
 *   <li>{@code forgewrapper.mainClass} — the class to hand off to. Its presence
 *       is what selects this mode.</li>
 *   <li>{@code forgewrapper.minecraft} — the vanilla client jar to patch.</li>
 *   <li>{@code forgewrapper.patched} — where the patched jar goes.</li>
 *   <li>{@code forgewrapper.jarmod} — {@code File.pathSeparator}-separated
 *       archives to overlay, in order. Absent or empty means strip only.</li>
 * </ul>
 *
 * Arguments reach the real main class untouched, exactly as in the processor
 * era: the wrapper is a shim, not a launcher.
 */
public class JarModLauncher {
    public static void launch(String[] args) throws Throwable {
        String mainClass = System.getProperty("forgewrapper.mainClass");
        Path client = requirePath("forgewrapper.minecraft");
        Path output = requirePath("forgewrapper.patched");
        List<Path> overlays = parsePaths(System.getProperty("forgewrapper.jarmod"));

        checkAbsentFromClassPath(client);

        ClientPatcher.patch(client, overlays, output);

        Path directory = output.getParent();
        ModuleUtil.setupClassPath(directory, Collections.singletonList(output.getFileName().toString()));

        Class.forName(mainClass, false, ClassLoader.getSystemClassLoader())
            .getMethod("main", String[].class)
            .invoke(null, new Object[] { args });
    }

    /**
     * The patched jar is appended to the classpath, and appending cannot shadow.
     * If the launcher also left the vanilla jar on {@code -cp}, its unpatched —
     * and, for the merge case, unmodded — classes would win every lookup, and
     * the game would start looking like it worked. Refuse instead.
     */
    private static void checkAbsentFromClassPath(Path client) {
        Path target = client.toAbsolutePath().normalize();
        for (String entry : System.getProperty("java.class.path", "").split(File.pathSeparator)) {
            if (entry.isEmpty()) {
                continue;
            }
            if (Paths.get(entry).toAbsolutePath().normalize().equals(target)) {
                throw new IllegalStateException(
                    "The vanilla client jar is on the classpath: " + entry + "\n" +
                    "Pre-1.13 Forge runs against a patched copy of it, which is appended at runtime and " +
                    "so cannot shadow an entry that is already there. Drop the vanilla jar from -cp."
                );
            }
        }
    }

    private static Path requirePath(String property) {
        String value = System.getProperty(property);
        if (value == null || value.isEmpty()) {
            throw new IllegalStateException("Missing required JVM argument -D" + property + "=");
        }
        return Paths.get(value).toAbsolutePath();
    }

    private static List<Path> parsePaths(String value) {
        List<Path> paths = new ArrayList<>();
        if (value == null) {
            return paths;
        }
        for (String entry : value.split(File.pathSeparator)) {
            if (!entry.isEmpty()) {
                paths.add(Paths.get(entry).toAbsolutePath());
            }
        }
        return paths;
    }
}
