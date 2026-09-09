package io.github.zekerzhayard.forgewrapper.installer.patch;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JarModLauncherTest {
    @Test
    void putsThePatchedJarFirstAndDropsTheVanillaOne(@TempDir Path dir) throws Exception {
        Path client = Files.createFile(dir.resolve("client.jar"));
        Path patched = Files.createFile(dir.resolve("patched.jar"));
        Path library = Files.createFile(dir.resolve("lwjgl.jar"));
        Path wrapper = Files.createFile(dir.resolve("ForgeWrapper.jar"));

        List<URL> urls = classPath(Arrays.asList(wrapper, client, library), client, patched);

        assertEquals(patched.toUri().toURL(), urls.get(0));
        assertEquals(Arrays.asList(patched.toUri().toURL(), wrapper.toUri().toURL(), library.toUri().toURL()), urls);
        assertFalse(urls.contains(client.toUri().toURL()));
    }

    @Test
    void dropsTheVanillaJarNamedByADifferentPathSpelling(@TempDir Path dir) throws Exception {
        Path client = Files.createFile(dir.resolve("client.jar"));
        Path patched = Files.createFile(dir.resolve("patched.jar"));
        Path spelt = dir.resolve("sub").resolve("..").resolve("client.jar");
        Files.createDirectories(dir.resolve("sub"));

        List<URL> urls = classPath(java.util.Collections.singletonList(spelt), client, patched);

        assertEquals(1, urls.size());
        assertTrue(urls.contains(patched.toUri().toURL()));
    }

    private static List<URL> classPath(List<Path> entries, Path client, Path patched) throws Exception {
        StringBuilder joined = new StringBuilder();
        for (Path entry : entries) {
            if (joined.length() > 0) {
                joined.append(File.pathSeparator);
            }
            joined.append(entry);
        }
        String previous = System.getProperty("java.class.path");
        System.setProperty("java.class.path", joined.toString());
        try (URLClassLoader loader = (URLClassLoader) JarModLauncher.newClassLoader(client, patched)) {
            return new ArrayList<>(Arrays.asList(loader.getURLs()));
        } finally {
            System.setProperty("java.class.path", previous);
        }
    }
}
