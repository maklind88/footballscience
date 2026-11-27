# Linux WebView compatibility patch

`tauri-runtime-wry-2.11.4` comes from the `tauri-runtime-wry` 2.11.4 crates.io archive, SHA-256 `4e6fac707727b7a2f48e4ded90976324267371073edbb415ffb73bb0458d203f`, at [upstream commit `ca90b46`](https://github.com/tauri-apps/tauri/tree/ca90b46b2e2cbbc981dae1b809f4af4343fe0558/crates/tauri-runtime-wry). The original licenses are in the crate directory.

The sole source change leaves protocol deduplication enabled for views that reuse a GTK context. Wry constructs a fresh ephemeral GTK context for each incognito view, so these views need their own scheme registrations. Candidate activation and recovery continue to use ephemeral WebViews with the existing origin policy and per-window capabilities. Remove the Cargo patch when the same behavior lands in a supported upstream version and packaged Linux QA passes.
