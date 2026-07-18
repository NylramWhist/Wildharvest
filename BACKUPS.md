# Backups

This workspace keeps versioned snapshots of the main gameplay module in `backups/`. Since stage 10, `wildharvest` is the only active source; earlier names occur only in historical backup labels.

Restore flow:

1. Pick a Wildharvest snapshot, for example `backups/wildharvest-v0.99.0`.
2. Restore it as `{userData}/Data/modules/wildharvest` so the folder exactly matches the manifest ID.
3. Restart Foundry or return to Setup before re-entering the world.

Names used before `wildharvest` are historical archives only and must not be restored as active development sources.

Versioning rule for next stages:

- each milestone can be saved as a new snapshot folder
- folder format: `backups/wildharvest-vX.Y.Z`
- each milestone can also be saved as a ZIP archive: `backups/wildharvest-vX.Y.Z.zip`
- active development continues only in `wildharvest`

Backup script:

- run `powershell -ExecutionPolicy Bypass -File .\tools\create-module-backup.ps1`
- the script reads `wildharvest/module.json`
- it creates both:
  - snapshot folder: `backups/wildharvest-vX.Y.Z`
  - ZIP archive: `backups/wildharvest-vX.Y.Z.zip`
- if the same version already exists, the script appends a timestamp suffix instead of overwriting

Stage 01 archives:

- `backups/Ghateret-0.30.3-stage-01-pre-source-unification.zip` — source before unification
- `backups/legacy-poszukiwania-v0.30.0-stage-01` — retired 0.30.0 working copy
- `backups/ghateret-v0.31.0` — verified final post-stage snapshot
- `backups/ghateret-v0.31.0.zip` — verified final post-stage ZIP
- `Ghateret-0.31.0.zip` — clean module archive matching the 0.31.0 manifest
- `backups/workspace-v0.31.0-policy-update.zip` — audit, roadmap, and workspace policy after indefinite remote-hosting deferral

The retired companion content project was removed in stage 09. Its redundant old snapshot directory and ZIP were replaced by one final local retirement archive documented below.

Stage 02 archives:

- `backups/Ghateret-0.31.0-stage-02-pre-migration-backups.zip` — verified source before stage 02
- `backups/ghateret-v0.32.0` — verified post-stage snapshot
- `backups/ghateret-v0.32.0.zip` — verified post-stage ZIP
- `Ghateret-0.32.0.zip` — clean module archive matching the 0.32.0 manifest

Stage 03 archives:

- `backups/Ghateret-0.32.0-stage-03-pre-nondestructive-migration.zip` — verified source before stage 03
- `backups/ghateret-v0.33.0` — verified post-stage snapshot
- `backups/ghateret-v0.33.0.zip` — verified post-stage ZIP
- `Ghateret-0.33.0.zip` — clean module archive matching the 0.33.0 manifest

Stage 04 archives:

- `backups/Ghateret-0.33.0-stage-04-pre-safe-lifecycle.zip` — verified source before stage 04
- `backups/ghateret-v0.40.0` — verified post-stage snapshot
- `backups/ghateret-v0.40.0.zip` — verified post-stage ZIP
- `Ghateret-0.40.0.zip` — clean module archive matching the 0.40.0 manifest

Stage 05 archives:

- `backups/Ghateret-0.40.0-stage-05-pre-gm-authority.zip` — verified source before stage 05
- `backups/ghateret-v0.50.0` — verified post-stage snapshot
- `backups/ghateret-v0.50.0.zip` — verified post-stage ZIP
- `Ghateret-0.50.0.zip` — clean module archive matching the 0.50.0 manifest

Stage 06 archives:

- `backups/Ghateret-0.50.0-stage-06-pre-inventory-fix.zip` — verified source before stage 06
- `backups/ghateret-v0.60.0` — verified post-stage snapshot
- `backups/ghateret-v0.60.0.zip` — verified post-stage ZIP
- `Ghateret-0.60.0.zip` — clean module archive matching the 0.60.0 manifest

Stage 07 archives:

- `backups/Ghateret-0.60.0-stage-07-pre-socket-multigm.zip` — verified source before stage 07
- `backups/ghateret-v0.70.0` — verified post-stage snapshot
- `backups/ghateret-v0.70.0.zip` — verified post-stage ZIP
- `Ghateret-0.70.0.zip` — clean module archive matching the 0.70.0 manifest

Post-stage 07 loot identity hotfix:

- `backups/Ghateret-0.70.0-hotfix-loot-id-pre.zip` — source immediately before the compendium document ID fix
- `backups/ghateret-v0.70.1` — verified hotfix snapshot
- `backups/ghateret-v0.70.1.zip` — verified hotfix ZIP
- `Ghateret-0.70.1.zip` — clean module archive matching the 0.70.1 manifest

Audit update for the planned item-value loot engine:

- `backups/Ghateret-0.70.1-audit-value-loot-pre.zip` — source immediately before adding audit finding 18
- `backups/ghateret-v0.70.2` — verified documentation-update snapshot
- `backups/ghateret-v0.70.2.zip` — verified documentation-update ZIP
- `Ghateret-0.70.2.zip` — clean module archive matching the 0.70.2 manifest

Stage 08 archives:

- `backups/Ghateret-0.70.2-stage-08-pre-i18n.zip` — verified source before single-source localization work
- `backups/ghateret-v0.80.0` — verified post-stage snapshot
- `backups/ghateret-v0.80.0.zip` — verified post-stage ZIP
- `Ghateret-0.80.0.zip` — clean module archive matching the 0.80.0 manifest

Stage 09 archives:

- `backups/Ghateret-0.80.0-stage-09-pre-content-removal.zip` — verified main-module source before stage 09
- `backups/retired-gathering-content-0.2.0-stage-09-pre-removal.zip` — final safety archive of the abandoned companion project
- `backups/ghateret-v0.85.0` — verified post-stage snapshot
- `backups/ghateret-v0.85.0.zip` — verified post-stage ZIP
- `Ghateret-0.85.0.zip` — clean module archive matching the 0.85.0 manifest

Stage 10 archives:

- `backups/Ghateret-0.85.0-stage-10-pre-wildharvest-rename.zip` — verified source before the clean Wildharvest rename
- `backups/wildharvest-v0.90.0` — verified post-stage Wildharvest snapshot
- `backups/wildharvest-v0.90.0.zip` — verified post-stage Wildharvest ZIP
- `Wildharvest-0.90.0.zip` — clean module archive matching the 0.90.0 manifest

Stage 11 archives:

- `backups/Wildharvest-0.90.0-stage-11-pre-loot-engines.zip` — verified source before adding the selectable loot engines
- `backups/wildharvest-v0.92.0` — verified post-stage snapshot
- `backups/wildharvest-v0.92.0.zip` — verified post-stage ZIP
- `Wildharvest-0.92.0.zip` — clean module archive matching the 0.92.0 manifest

Post-stage 11 rules-form hotfix:

- `backups/Wildharvest-0.92.0-hotfix-rules-form-pre.zip` — verified 0.92.0 source before correcting the ApplicationV2 form binding
- `backups/wildharvest-v0.92.1` — verified hotfix snapshot
- `backups/wildharvest-v0.92.1.zip` — verified hotfix ZIP
- `Wildharvest-0.92.1.zip` — clean module archive matching the 0.92.1 manifest

Stage 12 archives:

- `backups/Wildharvest-0.92.1-stage-12-pre-compatibility.zip` — verified source before the Foundry/dnd5e compatibility pass
- `backups/wildharvest-v0.95.0` — verified post-stage snapshot
- `backups/wildharvest-v0.95.0.zip` — verified post-stage ZIP
- `Wildharvest-0.95.0.zip` — clean module archive matching the 0.95.0 manifest

Stage 13 archives:

- `backups/Wildharvest-0.95.0-stage-13-pre-release-pipeline.zip` — verified source before documentation and release-pipeline work
- `backups/wildharvest-v0.99.0` — verified post-stage snapshot
- `backups/wildharvest-v0.99.0.zip` — verified post-stage ZIP
- `Wildharvest-0.99.0.zip` — clean allowlisted module archive matching the 0.99.0 manifest, with development tests and tools excluded

Stage 14 archives:

- `backups/Wildharvest-0.99.0-stage-14-pre-1.0.0.zip` — verified source before final version promotion
- `backups/wildharvest-v1.0.0` — verified stable source snapshot and rollback baseline before visual changes
- `backups/wildharvest-v1.0.0.zip` — verified full-source backup ZIP
- `Wildharvest-1.0.0.zip` — clean allowlisted local release matching the 1.0.0 manifest

Post-1.0 visual release 1.1.0:

- `backups/Wildharvest-1.0.0-stage-1.1-pre-workbench-theme.zip` — stable 1.0.0 source before visual changes
- `backups/wildharvest-v1.1.0` — verified full-source snapshot of the GM Workbench theme
- `backups/wildharvest-v1.1.0.zip` — verified full-source backup ZIP
- `Wildharvest-1.1.0.zip` — clean allowlisted release for owner visual testing

Post-1.0 visual release 1.2.0:

- `backups/Wildharvest-1.1.0-stage-1.2-pre-compact-close-cleanup.zip` — verified 1.1.0 source before the Launch/Responses density pass and Close-button cleanup; SHA-256 `D4C21A9210FCFF78E4F43167C4D87B9B9FC47AF8BFA1C6B9DFC2C8DC8C43FC15`
- `backups/wildharvest-v1.2.0` — verified full-source snapshot of the completed 1.2.0 update
- `backups/wildharvest-v1.2.0.zip` — verified full-source backup ZIP; SHA-256 `582F771542D335D6F0DA634F0AC66291BF9C5FB139128D684EC9EC054ADD0E21`
- `Wildharvest-1.2.0.zip` — clean allowlisted release with 79 runtime/documentation files; SHA-256 `8985FC986F67A8D0C7F3B07C2204A3AA4353CDF863ECE1E76E67D4ED9DE8C347`

Post-1.0 visual release 1.3.0:

- `backups/Wildharvest-1.2.0-stage-1.3-pre-presets-list.zip` — verified 1.2.0 source before replacing Preset cards with the Workbench table; SHA-256 `B3E5B44B8EC42DDDABDFC7B44B54CFAD95236C0C38BEB0830CACD324797616D2`
- `backups/wildharvest-v1.3.0` — verified full-source snapshot of the completed Presets redesign
- `backups/wildharvest-v1.3.0.zip` — verified full-source backup ZIP; SHA-256 `56EC12C30D5E0BAC3E7E2DA516D23507E31F36BA255B0112D0B1B5B3891F2F3F`
- `Wildharvest-1.3.0.zip` — clean allowlisted release with 79 runtime/documentation files; SHA-256 `936181CDE4BCEE04B7C5D73E619491EE04F304E7FD762E1A91A3A6FC2030E2E7`

Post-1.0 visual release 1.4.0:

- `backups/Wildharvest-1.3.0-stage-1.4-pre-history-workbench.zip` — verified 1.3.0 source before the three-pane History redesign; SHA-256 `7F000D8AF54CA0ABFE0D261AE6DD3DF62ABC96176DBD3B27349D4C0C2387D8D7`
- `backups/wildharvest-v1.4.0` — verified full-source snapshot of the completed History workbench and original visual roadmap
- `backups/wildharvest-v1.4.0.zip` — verified full-source backup ZIP; SHA-256 `C47A239C9742376E1F7DD6DD3B2F94D2CBD4F132ECFEAABB45269C959E333CA6`
- `Wildharvest-1.4.0.zip` — clean allowlisted release with 79 runtime/documentation files; SHA-256 `333B847D89DD4C1FE832747C2C95AB137836F437467217B8D451C0046F8A98F8`

Post-visual technical release 1.5.0:

- `backups/Wildharvest-1.4.0-stage-1.5-pre-technical-refactor.zip` — verified 1.4.0 source before splitting dialog utilities, History rendering, and Workbench CSS; SHA-256 `4CC539ED4871FF9DCAF8DFA0CFD28A7683360535C1EFDB8BF3F598026AC3D5E0`
- `backups/wildharvest-v1.5.0` — verified full-source snapshot of the no-behavior-change technical stabilization
- `backups/wildharvest-v1.5.0.zip` — verified full-source backup ZIP; SHA-256 `7C4F54D6282B9DF90E1F98DB42E821A81438FB59BC2F2E0D511F2536864C79FA`
- `Wildharvest-1.5.0.zip` — clean allowlisted release with 84 runtime/documentation files; SHA-256 `9ABF9FE777B3948BEA196E3F361EE7C5C1546E6C7597DE13F882FD2825F049B0`

UI hotfix 1.5.1:

- `backups/Wildharvest-1.5.0-hotfix-1.5.1-pre-close-favorites-removal.zip` — full source before the native-close, obsolete Favorites removal, and History grouping hotfix; SHA-256 `D2D8C773B7EA349E53B490DE3767E95467F4605E65F3CBD2CD81689137BA3A9F`
- `backups/wildharvest-v1.5.1` — verified full-source snapshot of hotfix 1.5.1
- `backups/wildharvest-v1.5.1.zip` — verified full-source backup ZIP; SHA-256 `034D5F5236CEF3ABB17CAAD3A09FA0EBF37AD13B85C619F3856E2AA50F8B2536`
- `Wildharvest-1.5.1.zip` — clean allowlisted release with 83 runtime/documentation files; SHA-256 `899CC4645F10C238B0A27DAACC813ABF2D40D52ED60EB94790F82933C7FF62A7`

History-list hotfix 1.5.2:

- `backups/Wildharvest-1.5.1-hotfix-1.5.2-pre-player-history-only.zip` — full source before limiting History to player-character and player-assigned Actors; SHA-256 `C529EA430D727979FC70EFBA9E0E8DDA10E4E5C990B104AEFAB401E15FF42DBF`
- `backups/wildharvest-v1.5.2` — verified full-source snapshot of hotfix 1.5.2
- `backups/wildharvest-v1.5.2.zip` — verified full-source backup ZIP; SHA-256 `58ADF60369285332F5581E8AEB2B203CAA06A88BCE5F2E0AE261634B1434A0C2`
- `Wildharvest-1.5.2.zip` — clean allowlisted release with 83 runtime/documentation files; SHA-256 `E6A6C06BEA9009B3480811A84F3F06507B59D3DEB65E50B622F678E0AB2DF867`

Technical modularization release 1.6.0:

- `backups/Wildharvest-1.5.2-stage-1.6-pre-panel-modularization.zip` — full source before extracting the Launch, Responses, and Presets view boundaries; SHA-256 `7633AF1A141C6A728591F3F17F596A1819D2C87AA89CF3DAB221E3D63CFA804E`
- `backups/wildharvest-v1.6.0` — verified full-source snapshot of the second GM panel modularization pass
- `backups/wildharvest-v1.6.0.zip` — verified full-source backup ZIP; SHA-256 `3A0A27D27B0734686ADF0F7E338D9FCE63B9C04E291E231292A98F6D10AF9CC3`
- `Wildharvest-1.6.0.zip` — clean allowlisted release with 87 runtime/documentation files; SHA-256 `EFEF93F3989666F471FE7AA00594564814B0472F9B5552578A7447FC4F4043B3`

Total-roll schema release 1.7.0:

- `backups/Wildharvest-1.6.0-stage-1.7-pre-remove-dc-outcomes.zip` — full source before removing inert DC, margin, and outcomes data; SHA-256 `F436D156A6C61DAA685037FCB4F91AE160287607381AA05A7D5BDA39563466E6`
- `backups/wildharvest-v1.7.0` — verified full-source snapshot of the explicit total-roll-to-Loot-Points model
- `backups/wildharvest-v1.7.0.zip` — verified full-source backup ZIP; SHA-256 `90FA41FCACC77755C829CB82C5EDFC1E1AAC1039C59BED5A0E322F0FABE6772A`
- `Wildharvest-1.7.0.zip` — clean allowlisted release with 87 runtime/documentation files; SHA-256 `3D388676A6B96B3DADE279CDF193AAAF841B3750C10AD37D74C2A0BBFE5A61EF`

Compact player-flow release 1.8.0:

- `backups/Wildharvest-1.7.0-stage-1.8-pre-player-dialog-redesign.zip` — full 1.7.0 source before replacing result chat messages with the compact two-window player flow; SHA-256 `B5FF277661C5199B4E49E5B63D577C20EF80B5269199BDA7CBA7AE40782F9F2B`
- `backups/wildharvest-v1.8.0` — verified 88-file full-source snapshot of the compact player roll/result flow
- `backups/wildharvest-v1.8.0.zip` — verified full-source backup ZIP; SHA-256 `4F33F7CFE70D3D24C85930501855FE77654AAE1E6F77D06E10D12767BDA18493`
- `Wildharvest-1.8.0.zip` — clean allowlisted release with 87 runtime/documentation files; SHA-256 `6C66A84D55E8D2ED890F8729055C87BC10D8C54AFD0BE8761DD584A65306A417`

Player-flow hotfix 1.8.1:

- `backups/Wildharvest-1.8.0-hotfix-1.8.1-pre-view-all-bring-to-front.zip` — full 1.8.0 source before making reward details permanent and guarding disconnected parent-dialog focus; SHA-256 `60EFE5E9E54E02173B64068CA4E038917E17D5FC8275329D98CA91E8150A720E`
- `backups/wildharvest-v1.8.1` — verified 88-file full-source snapshot of hotfix 1.8.1
- `backups/wildharvest-v1.8.1.zip` — verified full-source backup ZIP; SHA-256 `ACBB6F65442560307218C7CCBE03A40EDCFFB290D3E383E6CB174BB56FA5352B`
- `Wildharvest-1.8.1.zip` — clean allowlisted release with 87 runtime/documentation files; SHA-256 `B123F3F60F18044C53FED5BF3BE991EC3DDE93950D0F5F8FC5DA7A9BA2B4D6A6`

Authority and interruption-recovery release 1.9.0:

- `backups/Wildharvest-1.8.1-stage-1.9-pre-authority-recovery.zip` — full 1.8.1 source before replacing player authority socket messages and adding interrupted-resolution recovery; SHA-256 `7660F787426CE18C01A78DB218A42AAFF1579CE203B87D90AC73B8C98F7F8876`
- `backups/wildharvest-v1.9.0` — verified 89-file full-source snapshot of the authenticated player-request and conservative recovery update
- `backups/wildharvest-v1.9.0.zip` — verified full-source backup ZIP; SHA-256 `B813A92EE593CB6E97F06CAC019EDCDDB35C758C97730E5AD6B21F019E0E6969`
- `Wildharvest-1.9.0.zip` — clean allowlisted release with 88 runtime/documentation files; SHA-256 `F43EFF933A6798334EB9D980A895403372FA7690FB2E0E5BEAB7D16B7EF34B13`

Loot and configuration-integrity release 1.10.0:

- `backups/Wildharvest-1.9.0-stage-1.10-pre-loot-data-integrity.zip` — full 1.9.0 source before canonical reward identity, bounded value selection, pack filtering, strict identifiers, and transactional import; SHA-256 `A2BA0826EA65A0D3D496CC9519A32455486184F1522640C6CFA3B8F085DBEB40`
- `backups/wildharvest-v1.10.0` — verified 90-file full-source snapshot of second-audit stage 2
- `backups/wildharvest-v1.10.0.zip` — verified full-source backup ZIP; SHA-256 `CDE0C0EC518ED922221D4B5EB4D377EB78EC748E3B8A62E589F3371A2A91A15E`
- `Wildharvest-1.10.0.zip` — clean allowlisted release with 89 runtime/documentation files; SHA-256 `B78E5A69BFB1EF7762CB6D80269B214D8EF1B2458A1C46F687841864CB349A57`

Accessibility release 1.11.0:

- `backups/Wildharvest-1.10.0-stage-1.11-pre-accessibility.zip` — full 1.10.0 source before linked controls, accessible keyboard tabs, focus restoration, and player reduced-motion coverage; SHA-256 `F7D0C469B3C1784AEEAD6F30FBFA964AECFF6308AF128D89876A54171A374A15`
- `backups/wildharvest-v1.11.0` — verified 90-file full-source snapshot of second-audit stage 3
- `backups/wildharvest-v1.11.0.zip` — verified full-source backup ZIP; SHA-256 `DEF61AAF95A08BA108B7C54443BA23B2AF026943E7BDE60ECB39394124F9CF33`
- `Wildharvest-1.11.0.zip` — clean allowlisted release with 89 runtime/documentation files; SHA-256 `C68033C30834CDE05216495FC4E017FB039C3FB0F268304983CAC5B748783416`

Architecture-cleanup release 1.12.0:

- `backups/Wildharvest-1.11.0-stage-1.12-pre-architecture-cleanup.zip` — full 1.11.0 source before shared DialogV2 boundaries, CSS separation, custom-property migration, and unused-asset removal; SHA-256 `890187376699DE6A7714CCBE4ABB26FA402E0D9CC23BA50C7463445EE512447C`
- `backups/wildharvest-v1.12.0` — verified 87-file full-source snapshot of second-audit stage 4
- `backups/wildharvest-v1.12.0.zip` — verified full-source backup ZIP; SHA-256 `EFE55E3F34390B8947D986E44F4C57FA44D74051C14E67352BB33921203273B7`
- `Wildharvest-1.12.0.zip` — clean allowlisted release with 86 runtime/documentation files; SHA-256 `602BA03E0A7184635F857DA41DA622948ABD24559CE2315ADDD6B0894DD38BEF`

Integration and conservative compatibility-closure release 1.13.0:

- `backups/Wildharvest-1.12.0-stage-1.13-pre-integration-compatibility.zip` — full 1.12.0 source before the two-player integration harness, compatibility matrix, and second-audit closure; SHA-256 `C137F7748247A4480D69C0907BC23ED28082F52F4FBF220AE304645CFB32FAD5`
- `backups/wildharvest-v1.13.0` — verified 89-file full-source snapshot of second-audit stage 5
- `backups/wildharvest-v1.13.0.zip` — verified full-source backup ZIP; SHA-256 `79A67506D76A756FC93AB8EDB2982346DB2A7323F096AEF36A2DD2994BCF16B6`
- `Wildharvest-1.13.0.zip` — clean allowlisted release with 86 runtime/documentation files; SHA-256 `A01BBAA4113844A6EDC01E3FC65CD5F56E72C15629854E22AC7DD33F15643495`

GM Ko-fi footer release 1.14.0:

- `backups/Wildharvest-1.13.0-stage-1.14-pre-kofi-footer.zip` — full 1.13.0 source before adding the localized GM-only Ko-fi footer banner; SHA-256 `BC3AD955EEA5BD8D2518C8D0A9A813773B9280F818F211ED3EC4DCC7B5EE2D4A`
- `backups/wildharvest-v1.14.0` — verified 89-file full-source snapshot of the localized support-footer release
- `backups/wildharvest-v1.14.0.zip` — verified full-source backup ZIP; SHA-256 `6ED9B01BA8ED93C2BDC0CC9A733ABD0596E7FA43E4B01D4BF8D45AB8380C638D`
- `Wildharvest-1.14.0.zip` — clean allowlisted release with 86 runtime/documentation files; SHA-256 `8A3CC6D54A1643659723AC6B0A1F4CF50A5DA84D3D85300A7918FCF1AFD12E96`
