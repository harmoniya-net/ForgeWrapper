package io.github.zekerzhayard.forgewrapper.installer.patch;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

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

        ClientPatcher.patch(client, overlays, output);

        ClassLoader loader = newClassLoader(client, output);
        Thread.currentThread().setContextClassLoader(loader);
        Class.forName(mainClass, false, loader)
            .getMethod("main", String[].class)
            .invoke(null, new Object[] { args });
    }

    /**
     * The patched jar has to be reached instead of the vanilla one, not as well
     * as it — appending to the running classpath cannot shadow what is already
     * there, and a launcher that honours {@code inheritsFrom} always puts the
     * inherited client jar on {@code -cp}. The Mojang format has no way to ask
     * it not to, so the classpath is rebuilt here rather than negotiated: the
     * patched jar first, everything else as it was, the vanilla jar dropped.
     *
     * A {@link URLClassLoader} is also what LaunchWrapper expects — its
     * {@code Launch} casts its own loader to one to read the sources for
     * {@code LaunchClassLoader}, which is a cast that fails outright against
     * the Java 9+ application loader.
     */
    static ClassLoader newClassLoader(Path client, Path patched) throws Exception {
        Path vanilla = client.toAbsolutePath().normalize();
        List<URL> urls = new ArrayList<>();
        urls.add(patched.toUri().toURL());
        for (String entry : System.getProperty("java.class.path", "").split(File.pathSeparator)) {
            if (entry.isEmpty()) {
                continue;
            }
            Path path = Paths.get(entry).toAbsolutePath().normalize();
            if (!path.equals(vanilla)) {
                urls.add(path.toUri().toURL());
            }
        }
        // Platform loader on 9+, null (bootstrap) on 8 — either way the
        // application loader, and with it the vanilla jar, stays out of reach.
        return URLClassLoader.newInstance(urls.toArray(new URL[0]), platformClassLoader());
    }

    private static ClassLoader platformClassLoader() {
        try {
            return (ClassLoader) ClassLoader.class.getMethod("getPlatformClassLoader").invoke(null);
        } catch (ReflectiveOperationException e) {
            return null;
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
        if (value == null) {
            return Collections.emptyList();
        }
        List<Path> paths = new ArrayList<>();
        for (String entry : value.split(File.pathSeparator)) {
            if (!entry.isEmpty()) {
                paths.add(Paths.get(entry).toAbsolutePath());
            }
        }
        return paths;
    }
}
