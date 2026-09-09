package io.github.zekerzhayard.forgewrapper.installer.patch;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClientPatcherTest {
    @Test
    void stripsMetaInfWithNoOverlay(@TempDir Path dir) throws IOException {
        Map<String, String> client = new LinkedHashMap<>();
        client.put("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n");
        client.put("META-INF/MOJANG_C.SF", "signature");
        client.put("META-INF/MOJANG_C.DSA", "signature");
        client.put("net/minecraft/client/Minecraft.class", "vanilla");
        Path jar = writeZip(dir.resolve("client.jar"), client);

        Path patched = ClientPatcher.patch(jar, Collections.<Path>emptyList(), dir.resolve("out/patched.jar"));

        assertIterableEquals(Collections.singletonList("net/minecraft/client/Minecraft.class"), names(patched));
        assertEquals("vanilla", read(patched, "net/minecraft/client/Minecraft.class"));
    }

    @Test
    void overlayReplacesClientEntriesAndAddsItsOwn(@TempDir Path dir) throws IOException {
        Map<String, String> client = new LinkedHashMap<>();
        client.put("zz.class", "vanilla");
        client.put("ia.class", "vanilla");
        Path jar = writeZip(dir.resolve("client.jar"), client);

        Map<String, String> universal = new LinkedHashMap<>();
        universal.put("zz.class", "forge");
        universal.put("cpw/mods/fml/Loader.class", "forge");
        universal.put("META-INF/FORGE.SF", "signature");
        Path zip = writeZip(dir.resolve("universal.zip"), universal);

        Path patched = ClientPatcher.patch(jar, Collections.singletonList(zip), dir.resolve("patched.jar"));

        assertIterableEquals(Arrays.asList("cpw/mods/fml/Loader.class", "ia.class", "zz.class"), names(patched));
        assertEquals("forge", read(patched, "zz.class"));
        assertEquals("vanilla", read(patched, "ia.class"));
    }

    @Test
    void laterOverlayWins(@TempDir Path dir) throws IOException {
        Path jar = writeZip(dir.resolve("client.jar"), single("a.class", "vanilla"));
        Path first = writeZip(dir.resolve("first.zip"), single("a.class", "first"));
        Path second = writeZip(dir.resolve("second.zip"), single("a.class", "second"));

        Path patched = ClientPatcher.patch(jar, Arrays.asList(first, second), dir.resolve("patched.jar"));

        assertEquals("second", read(patched, "a.class"));
    }

    @Test
    void writesTheSameBytesTwice(@TempDir Path dir) throws IOException {
        Path jar = writeZip(dir.resolve("client.jar"), single("a.class", "vanilla"));
        Path zip = writeZip(dir.resolve("universal.zip"), single("b.class", "forge"));

        byte[] first = Files.readAllBytes(ClientPatcher.patch(jar, Collections.singletonList(zip), dir.resolve("one.jar")));
        byte[] second = Files.readAllBytes(ClientPatcher.patch(jar, Collections.singletonList(zip), dir.resolve("two.jar")));

        assertArrayEquals(first, second);
    }

    @Test
    void keepsAnUpToDateJar(@TempDir Path dir) throws IOException {
        Path jar = writeZip(dir.resolve("client.jar"), single("a.class", "vanilla"));
        Path output = dir.resolve("patched.jar");
        ClientPatcher.patch(jar, Collections.<Path>emptyList(), output);

        // A marker no rebuild would reproduce.
        Files.write(output, "stale".getBytes(StandardCharsets.UTF_8));
        Files.setLastModifiedTime(output, FileTime.fromMillis(Files.getLastModifiedTime(jar).toMillis() + 10_000));
        ClientPatcher.patch(jar, Collections.<Path>emptyList(), output);

        assertEquals("stale", new String(Files.readAllBytes(output), StandardCharsets.UTF_8));
    }

    @Test
    void rebuildsWhenAnInputIsNewer(@TempDir Path dir) throws IOException {
        Path jar = writeZip(dir.resolve("client.jar"), single("a.class", "vanilla"));
        Path output = dir.resolve("patched.jar");
        ClientPatcher.patch(jar, Collections.<Path>emptyList(), output);

        Files.setLastModifiedTime(jar, FileTime.fromMillis(Files.getLastModifiedTime(output).toMillis() + 10_000));
        ClientPatcher.patch(jar, Collections.<Path>emptyList(), output);

        assertEquals("vanilla", read(output, "a.class"));
    }

    @Test
    void leavesNoTemporaryFileBehind(@TempDir Path dir) throws IOException {
        Path jar = writeZip(dir.resolve("client.jar"), single("a.class", "vanilla"));
        Path output = dir.resolve("patched.jar");

        ClientPatcher.patch(jar, Collections.<Path>emptyList(), output);

        assertTrue(Files.isRegularFile(output));
        assertFalse(Files.exists(dir.resolve("patched.jar.tmp")));
    }

    private static Map<String, String> single(String name, String content) {
        Map<String, String> entries = new LinkedHashMap<>();
        entries.put(name, content);
        return entries;
    }

    private static Path writeZip(Path path, Map<String, String> entries) throws IOException {
        Files.createDirectories(path.toAbsolutePath().getParent());
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(path))) {
            for (Map.Entry<String, String> entry : entries.entrySet()) {
                out.putNextEntry(new ZipEntry(entry.getKey()));
                out.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
        }
        return path;
    }

    private static List<String> names(Path jar) throws IOException {
        List<String> names = new ArrayList<>();
        try (ZipFile zip = new ZipFile(jar.toFile())) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                names.add(entries.nextElement().getName());
            }
        }
        return names;
    }

    private static String read(Path jar, String name) throws IOException {
        try (ZipFile zip = new ZipFile(jar.toFile())) {
            ZipEntry entry = zip.getEntry(name);
            try (InputStream in = zip.getInputStream(entry)) {
                java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
                byte[] chunk = new byte[1024];
                int read;
                while ((read = in.read(chunk)) != -1) {
                    buffer.write(chunk, 0, read);
                }
                return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            }
        }
    }
}
