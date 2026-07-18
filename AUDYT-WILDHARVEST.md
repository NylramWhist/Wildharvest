# Audyt projektu i plan migracji do Wildharvest

Data audytu: 2026-07-10

## Drugi audyt po wersji 1.8.1

Drugi kompleksowy audyt wykonano 2026-07-13 po potwierdzeniu przez właściciela, że bieżący przepływ 1.8.1 działa poprawnie. Nowe ustalenia podzielono na pięć etapów:

1. **Ukończony jako 1.9.0** — autorytatywne żądania gracza przeniesiono z broadcastowego socketu do krótkotrwałej flagi własnego dokumentu User. Hook `updateUser` dostarcza faktyczny `userId`; dodano accepted-only, wygaśnięcie, kolejkę, ochronę duplikatów i konserwatywne odzyskiwanie `resolving`.
2. **Ukończony jako 1.10.0** — nagrody używają kanonicznej pary ID kompendium i dokumentu, silnik wartości wybiera najlepszą kombinację przez ograniczony zbiór sum zamiast serii prób zachłannych, import usuwa niedostępne paczki, odrzuca duplikaty identyfikatorów i zapisuje ustawienia transakcyjnie z rollbackiem.
3. **Ukończony jako 1.11.0** — formularze otrzymały powiązane etykiety i jawne nazwy kontrolek, zakładki GM semantykę ARIA oraz nawigację strzałkami/Home/End, filtry jawny stan, okna widoczny fokus i przywracanie fokusu, a pełny przepływ gracza obsługę reduced motion.
4. **Ukończony jako 1.12.0** — wspólny import/eksport konfiguracji i okno oferty gracza otrzymały osobne granice DialogV2, CSS rozdzielono na bazę, GM i gracza, wszystkie aktywne zmienne używają `--wildharvest-*`, a siedem grafik bez odwołań usunięto.
5. **Ukończony jako 1.13.0** — dodano deterministyczny model MG + dwóch graczy korzystający z produkcyjnych granic walidacji, autorytetu, odzyskiwania i socketu. Testy obejmują własność osobnych Actorów, jednokrotne nagrody, duplikaty, zmianę aktywnego MG i odzyskanie wyniku bez ponownego grantu. Macierz zgodności zachowuje konserwatywne minimum 13.351 i verified 14.360; realne uruchomienia 13.351, 14.364 i wielu klientów pozostają testami właściciela.

Najwyższy priorytet drugiego audytu wynikał z faktu, że `senderId` wewnątrz dowolnego pakietu socketowego nie stanowi niezależnego potwierdzenia klienta, który faktycznie wysłał wiadomość. W 1.9.0 żaden pakiet gracza nie może już uruchomić mutacji sesji ani przyznania nagród.

## Status realizacji

- Etap 01/14 — **ukończony jako 0.31.0 dnia 2026-07-11**. `ghateret` jest jedynym aktywnym źródłem, kopia 0.30.0 została zarchiwizowana, narzędzia wskazują źródło kanoniczne, a lokalne repozytorium Git działa na gałęzi `main`.
- Etap 02/14 — **ukończony jako 0.32.0 dnia 2026-07-11**. Migracje otrzymały obowiązkowy snapshot ustawień i flag Actor/Item, fingerprint integralności, deduplikację granicy migracji, limit trzech kopii oraz test zapisu z atrapą Foundry.
- Etap 03/14 — **ukończony jako 0.33.0 dnia 2026-07-11**. Usunięto oba resety całej konfiguracji; migracja v4 usuwa wyłącznie `gathering-content.*`, zachowuje dane niestandardowe i przerywa pracę na niepoprawnym JSON zamiast zapisywać puste wartości.
- Etap 04/14 — **ukończony jako 0.40.0 dnia 2026-07-11**. Rejestracja ustawień i menu jest synchroniczna w `init`, dodatkowe tłumaczenia startują w `i18nInit`, a zadania `ready` mają kontrolowaną kolejność i obsługę błędów zgodną z cyklem życia Foundry 13/14.
- Etap 05/14 — **ukończony jako 0.50.0 dnia 2026-07-11**. Klient gracza wysyła wyłącznie żądanie rozstrzygnięcia, a GM weryfikuje sesję, ofertę, Aktora i parametry, trwale blokuje ofertę przed rzutem oraz sam generuje i zapisuje nagrody.
- Etap 06/14 — **ukończony jako 0.60.0 dnia 2026-07-11**. Usunięto startową synchronizację ekwipunku i zależność od `stackQuantity`; bieżące pole ilości dokumentu Item jest jedynym źródłem prawdy, więc zużyte przedmioty nie wracają po restarcie.
- Etap 07/14 — **ukończony jako 0.70.0 dnia 2026-07-11**. Socket przesyła pojedyncze minimalne oferty i neutralne statusy bez wyników oraz nagród; tylko aktywny GM może mutować sesje, a pozostali GM synchronizują stan i mogą przejąć rolę po zmianie `activeGM`.
- Hotfix po etapie 07 — **ukończony jako 0.70.1 dnia 2026-07-11**. Wpisy indeksu kompendium są identyfikowane przez `_id` z obsługą `id` i klucza kolekcji, więc różne wylosowane przedmioty nie zlewają się już w jeden stos `xN`. Etap 08 pozostaje wersją 0.80.0.
- Aktualizacja audytu po etapie 07 — **ukończona jako 0.70.2 dnia 2026-07-11**. Dodano punkt 18: drugi, wybierany w ustawieniach system generowania łupu oparty na wartości przedmiotów. Realizację przypisano do etapu 11 bez zwiększania liczby 14 etapów.
- Etap 08/14 — **ukończony jako 0.80.0 dnia 2026-07-11**. Usunięto wbudowany katalog 271 angielskich tekstów z JavaScript; `lang/en.json` i `lang/pl.json` są jedynymi źródłami, wymuszony język nadal działa przez ładowanie obu plików, a testy pilnują kluczy, placeholderów i wszystkich literalnych odwołań.
- Etap 09/14 — **ukończony jako 0.85.0 dnia 2026-07-11**. Usunięto cały poboczny moduł `gathering-content`, jego źródła, skompilowane paczki, builder, osobny skrypt backupu, instrukcje instalacji i stare redundantne snapshoty. Zachowano jeden końcowy ZIP emerytalny oraz wyłącznie migrator kompatybilnościowy starych `packId` wraz z testami.
- Etap 10/14 — **ukończony jako 0.90.0 dnia 2026-07-11**. Moduł otrzymał nazwę `Wildharvest`, techniczne ID i folder `wildharvest`, namespace i18n `WILDHARVEST.*`, klasy CSS `wildharvest-*`, nowy socket, API, ścieżki assetów i format eksportu `wildharvest-config`. Zgodnie z decyzją właściciela jest to czysty moduł bez importu ustawień, flag i światów z dawnych ID.
- Etap 11/14 — **ukończony jako 0.92.0 dnia 2026-07-11**. Zachowano dotychczasowy silnik rarity i dodano wybierany silnik łącznej wartości GP z mapą `LP → cel GP`, tolerancją ±10%, normalizacją PP/GP/EP/SP/CP, preferowaniem różnych dokumentów, wspólnym kontraktem wyniku i testami obu ekonomii.
- Hotfix po etapie 11 — **ukończony jako 0.92.1 dnia 2026-07-11**. Okno zasad zostało prawidłowym formularzem najwyższego poziomu ApplicationV2. Usunięto niezwiązany z handlerem wewnętrzny `<form>`, którego natywne wysłanie przeładowywało stronę gry i rozbijało układ HUD-u do czasu twardego restartu.
- Etap 12/14 — **ukończony jako 0.95.0 dnia 2026-07-11**. Zweryfikowano używane publiczne API Foundry 13/14, dopisano kontrakt systemu `dnd5e` 5.3.0–5.3.3, testy manifestu i stabilnych powierzchni API oraz macierz testową. Lokalny smoke test Foundry 14.360 + dnd5e 5.3.3 przeszedł po zsynchronizowaniu instalacji; realne uruchomienia 13.351, 14.364 i scenariusz dwóch klientów pozostają bramkami przed rozszerzeniem deklaracji zgodności lub publiczną dystrybucją.
- Etap 13/14 — **ukończony jako 0.99.0 dnia 2026-07-12**. Dodano brakującą checklistę wydania, spójne odnośniki dokumentacji, bez-zależnościowy `package.json`, politykę formatowania i lokalny builder release. Builder uruchamia wszystkie kontrole, pakuje jawną listę 78 plików bez `tests/` i narzędzi, ponownie rozpakowuje ZIP oraz porównuje wszystkie hashe. Niepoprawne `license: "MIT"` usunięto do czasu wskazania przez właściciela rzeczywistego pliku licencji przed publiczną dystrybucją.
- Etap 14/14 — **ukończony jako prywatne lokalne 1.0.0 dnia 2026-07-12**. Wydanie zachowuje funkcjonalność i konserwatywny kontrakt zgodności kandydata 0.99.0, przechodzi 67 testów automatycznych oraz pełną weryfikację czystego ZIP-a. Zgodnie z decyzją właściciela końcowe testy runtime Foundry 1.0.0 pozostawiono do wykonania ręcznego. ZIP i pełny snapshot stanowią zamrożony punkt rollbacku przed cyklem zmian wizualnych od 1.1.0; GitHub, hosting, licencja publiczna i nieprzetestowane buildy pozostają poza deklarowanym zakresem.
- Rozwój po 1.0 — **motyw GM Workbench ukończony jako 1.1.0 dnia 2026-07-12**. Dodano odseparowany arkusz wizualny panelu GM z ciepłą czernią, ciemnym brązem, mosiądzem, zwartymi kontrolkami, mniejszymi promieniami, czytelnym fokusem i obsługą reduced motion. Nie zmieniono struktury danych, logiki, socketów, silników łupu ani okien gracza; strukturalne Presets i History pozostają osobnymi przyszłymi zmianami po ręcznej ocenie właściciela.
- Rozwój po 1.0 — **wydanie wizualne 1.2.0 ukończone dnia 2026-07-12**. Zagęszczono Launch Scene i Responses oraz usunięto zbędne dolne przyciski Close na rzecz natywnego X Foundry. Pozostawiono anulowanie operacji i Close Scene, ponieważ wykonują odrębne akcje. Logika rozgrywki, dane, sockety i oba silniki łupu pozostały bez zmian.
- Rozwój po 1.0 — **wydanie wizualne 1.3.0 ukończone dnia 2026-07-12**. Zakładkę Presets przebudowano z dużych kart na zwartą listę/tabelę Workbench z opisem, umiejętnością, pulą łupu, slotem ulubionych, stanem walidacji i kompletem dotychczasowych akcji. Dane presetów i ich zachowanie pozostały bez zmian; History jest następną osobną zmianą wizualną.
- Rozwój po 1.0 — **wydanie wizualne 1.4.0 ukończone dnia 2026-07-12**. History otrzymało trzykolumnowy układ Workbench: postacie, przeszukiwalną listę wpisów oraz szczegóły wyniku i nagród. Zachowano limit dziesięciu wpisów na Actora i dotychczasowy format flag bez migracji danych. Tym wydaniem ukończono wszystkie ekrany z pierwotnych wytycznych wizualnych Workbench.
- Rozwój po drugim audycie — **wydanie 1.14.0 ukończone dnia 2026-07-14**. Po prawej stronie stopki panelu MG dodano dyskretny, lokalizowany odnośnik „Wesprzyj Wildharvest na Ko-fi” do `https://ko-fi.com/tomorrokoshii`. Element jest dostępny z klawiatury, układa się bezpiecznie na wąskich oknach, nie pojawia się w oknach gracza i nie ładuje zewnętrznego widgetu, skryptu ani obrazu. Logika rozgrywki i dane pozostały bez zmian.

Zakres audytu:

- ówczesna kopia publikacyjna 0.30.3 / `Ghateret-0.30.3.zip`,
- starsza kopia robocza `poszukiwania` 0.30.0,
- poboczny moduł `gathering-content`,
- skrypty testów, walidacji, backupów i dokumentacja,
- zgodność z publicznym API Foundry VTT 13 i 14,
- pełna migracja brandingu i identyfikatorów do `Wildharvest` / `wildharvest`.

## Wniosek

Wersja 0.30.3 przechodzi kontrolę składni, walidację JSON i 16 obecnych testów jednostkowych, ale nie jest jeszcze gotowa do publicznego wydania. Najpierw trzeba usunąć ryzyko utraty konfiguracji, poprawić inicjalizację Foundry, przenieść rozstrzyganie nagród pod kontrolę GM, naprawić synchronizację ekwipunku i uporządkować jedno źródło prawdy.

## Punkty audytu a etapy realizacji

- Punkty 1–18 to lista wykrytych błędów, ryzyk, obszarów do dopracowania i zaplanowanych rozszerzeń.
- Etapy 1–14 to kolejność wdrażania poprawek prowadząca do wersji 1.0.0.
- Jeden etap może rozwiązać kilka powiązanych punktów audytu, dlatego liczby nie muszą być równe.
- Szczegółowe przypisanie wersji do etapów znajduje się w `VERSIONING.md`.

## P0 — blokery wydania

### 1. Brak jednego źródła prawdy

W projekcie istnieją dwie różne aktywne kopie:

- `poszukiwania`: manifest 0.30.0, ID `poszukiwania`, tytuł `Gathering`,
- dawna kopia publikacyjna: manifest 0.30.3, ID `ghateret`, tytuł `Ghateret`.

Skrypty `tools/validate-poszukiwania.ps1`, `tools/test-poszukiwania.ps1` i `tools/create-module-backup.ps1` nadal obsługują starszą kopię `poszukiwania`. To pozwala zaliczyć testy i zbudować backup innego kodu niż kod wydawany.

Do poprawy:

- zachować jedną aktywną ścieżkę, docelowo `wildharvest/`,
- usunąć lub zarchiwizować poza aktywnym projektem drugą kopię,
- wszystkie testy, walidatory, backupy i pakowanie kierować do manifestu źródłowego,
- dodać kontrolę, że wersja i hash plików w ZIP odpowiadają źródłu.

### 2. Zmiana ID już odcięła stare dane, a kolejna zmiana może zrobić to ponownie

Status: **rozstrzygnięte w 0.90.0 jako świadomy clean break**.

`scripts/constants.js:1` zmienił `MODULE_ID` z `poszukiwania` na `ghateret`, ale w 0.30.3 nie ma pełnej migracji ustawień i flag z dawnej przestrzeni nazw. Zmiana na `wildharvest` bez migracji ponownie ukryje:

- world settings: `locations`, `lootPools`, `randomLootPack`, `rulesConfig`, `dataVersion`, `searchSessions`,
- client setting: `languageMode`,
- flagi Actorów: `resources`, `searchLog`,
- flagi Itemów: `rewardId`, `rewardKey`, `quantityPath`, `sourceUuid`, `sourcePack`, `sourceDocumentId`, `stackQuantity`.

Do poprawy:

- przed zmianą zrobić eksport konfiguracji i backup świata,
- obsłużyć kolejno przestrzenie `poszukiwania` i `ghateret`,
- kopiować dane do `wildharvest` tylko wtedy, gdy nowe pole jest puste,
- migrację uczynić idempotentną i zapisać jej wersję,
- po migracji zweryfikować liczbę przeniesionych ustawień, Actorów i Itemów,
- zachować import starych eksportów z `format: "gathering-config"`, choć nowe eksporty powinny używać `wildharvest-config`,
- zdecydować, czy techniczne ID naprawdę ma się zmienić. Najbezpieczniejszy rebranding zachowuje stare ID i zmienia tylko tytuł; pełna zmiana ID wymaga traktowania Wildharvest jak nowego pakietu z migratorem danych.

Decyzja właściciela projektu:

- Wildharvest jest instalowany jako nowy, czysty moduł na światach i serwerach,
- nie rejestruje, nie czyta i nie migruje ustawień ani flag z dawnych namespace’ów,
- nie importuje dawnych formatów eksportu,
- używa własnego schematu danych v1 i własnych domyślnych ustawień,
- stare światy nie są objęte kompatybilnością i wymagają ręcznej konfiguracji Wildharvest od zera.

### 3. Destrukcyjna migracja `gathering-content`

Status: **naprawione w 0.33.0**.

W `scripts/settings.js:761-780` wystarczy jedno odwołanie zaczynające się od `gathering-content.`, aby migracja wyzerowała wszystkie lokacje, wszystkie pule łupów i pulę awaryjną. Świat z własnymi presetami oraz jednym starym kompendium może stracić całą konfigurację.

Do poprawy:

- nigdy nie resetować całej konfiguracji z powodu jednego starego `packId`,
- usuwać wyłącznie identyfikatory `gathering-content.*`,
- zachować lokacje, aktywności, umiejętności, ulubione sloty i inne kompendia,
- pokazać GM raport: które odwołania usunięto i które presety wymagają nowego źródła łupów,
- dodać test migracji konfiguracji mieszanej.

### 4. Wyścig podczas `init` w Foundry 13 i 14

Status: **naprawione w 0.40.0**.

Przed 0.40.0 `scripts/main.js` wykonywał `await preloadModuleTranslations()` przed `registerSettings()`. Publiczna dokumentacja API v13 i v14 zaznacza, że hooki nie są `await`owane, więc `setup` lub `ready` mogło wykonać się zanim ustawienia zostały zarejestrowane.

Wdrożona poprawka:

- `registerSettings()` oraz `registerRulesSettingsMenu()` wykonać synchronicznie przed pierwszym `await`,
- ładowanie dodatkowych tłumaczeń przenieść do `i18nInit` albo rozpocząć bez blokowania rejestracji,
- dodać test rozruchu z opóźnionym `fetch` tłumaczeń.

### 5. Nagrody są rozstrzygane po stronie gracza i mogą być powielane

Status: **naprawione w 0.50.0**.

Przed 0.50.0 publiczne API wystawiało `openSearchDialog`, a klient gracza sam wykonywał rzut, generował nagrody i zapisywał je do Aktora. Podwójne kliknięcie, ponowne otwarcie dialogu lub ręczne wywołanie API mogło przyznać nagrody wielokrotnie.

Wdrożona poprawka:

- GM powinien być autorytetem sesji, wyniku i przyznania nagród,
- gracz powinien wysyłać żądanie dla istniejącej, otwartej i przypisanej mu sesji,
- GM powinien sprawdzać `sessionId`, użytkownika, status, aktywność, Aktora i jednorazowość,
- po rozpoczęciu obsługi wyłączyć przycisk i zastosować blokadę `submitting`,
- po pierwszym wyniku oznaczyć ofertę jako zużytą i odrzucać kolejne,
- ograniczyć publiczne API albo wymagać zweryfikowanego kontekstu sesji.

### 6. Zdalna publikacja została wyłączona bezterminowo

Podczas audytu zdalny manifest i ZIP 0.30.3 zwracały HTTP 404. W etapie 01 pola zdalnego hostingu zostały usunięte, a `readme` i `changelog` wskazują pliki lokalne. GitHub, remote, automatyczna instalacja i aktualizacja pozostają wyłączone bez terminu i nie są częścią planu 1.0.0.

Do wykonania wyłącznie po osobnym poleceniu właściciela projektu:

- wybrać docelowy hosting projektu `Wildharvest`,
- ustawić stabilny URL manifestu,
- utworzyć release z ZIP-em dokładnie dla wersji manifestu,
- sprawdzać URL-e w automatycznej kontroli wydania,
- upewnić się, że folder modułu i `module.json.id` są identyczne (`wildharvest`).

## P1 — błędy wysokiego priorytetu

### 7. Zużyte przedmioty mogą wracać po restarcie

Status: **naprawione w 0.60.0**.

Przed 0.60.0 startowa synchronizacja podnosiła widoczną ilość przedmiotu do zapamiętanego `stackQuantity`. Flaga nie była zmniejszana, gdy gracz zużywał przedmiot, więc zużyty zasób mógł zostać odtworzony.

Wdrożona poprawka:

- usunąć globalną synchronizację z `ready`,
- traktować bieżącą ilość systemową jako źródło prawdy,
- flagę wykorzystywać tylko do identyfikacji pochodzenia, nie jako dolny limit ilości,
- dodać test: przyznaj 5, zużyj 2, restart — ma pozostać 3.

### 8. Socket ujawnia dane wszystkim klientom i za słabo weryfikuje wyniki

Status: **naprawione w 0.70.0**.

Foundry opisuje socket modułu jako przekaźnik pakietów do wszystkich innych klientów. Przed 0.70.0 kod:

- w `scripts/dialogs/search-offer-dialogs.js:619-626` wysyła cały `offersByUserId`, więc każdy klient otrzymuje przydziały wszystkich graczy,
- w `scripts/helpers/search-session-socket.js:49-69` wysyła pełny wynik, Aktora i nagrody do wszystkich klientów,
- w `scripts/helpers/search-session-state.js:66-73` sprawdza głównie typy liczb i długość tablicy, ale nie powiązanie z sesją, statusem, Aktorem ani rzeczywistą ofertą.

Filtrowanie po odebraniu ukrywało dane w UI, ale nie na poziomie transportu.

Wdrożona poprawka:

- nie przesyłać zbiorczych ofert; każdy pakiet powinien zawierać tylko minimalne dane jednej oferty,
- nie przesyłać prywatnych nagród socketem; użyć dokumentu/wiadomości z uprawnieniami lub ograniczyć socket do neutralnego statusu,
- walidować wynik względem rekordu sesji po stronie GM,
- ograniczyć rozmiar i długości wszystkich pól tekstowych oraz zagnieżdżonych tablic,
- dodać testy sfałszowanej sesji, innego Aktora, drugiego wyniku i zawyżonej nagrody.

### 9. Wielu GM może nadpisywać stan sesji

Status: **naprawione w 0.70.0**.

Przed 0.70.0 stan był inicjalizowany tylko na aktywnym GM, ale przycisk i panel były dostępne dla każdego GM. Każdy GM mógł później zapisywać własny lokalny `searchSessions` do tego samego world setting, tworząc ryzyko utraty sesji i niespójnych odpowiedzi.

Wdrożona poprawka:

- albo ograniczyć panel i zapis do `activeGM`,
- albo wdrożyć wspólny, wersjonowany stan z kontrolą konfliktów i scalaniem,
- reagować na zmianę aktywnego GM i odtwarzać stan po przejęciu roli.

### 10. Angielskie tłumaczenia mają dwa rozjechane źródła

Status: **naprawione w 0.80.0**.

`scripts/i18n.js` zawiera 271 twardo wpisanych tekstów EN, a `lang/en.json` ma 476 kluczy. Znaleziono 20 tekstów o tej samej nazwie, ale innej treści. Domyślne `languageMode: "en"` preferuje starsze stałe, dlatego domyślny angielski interfejs pokazuje nieaktualne opisy, np. stare znaczenie puli kompendiów i DC.

Do poprawy:

- pozostawić `lang/en.json` i `lang/pl.json` jako jedyne źródła,
- używać `game.i18n.localize/format`,
- jeśli potrzebny jest wymuszony język niezależny od Foundry, ładować oba JSON-y bez duplikowania tekstów w JS,
- dodać test identycznego zestawu kluczy oraz test braku starych nazw.

Wdrożona poprawka:

- usunięto cały `EN_STRINGS` z `scripts/i18n.js`,
- pozostawiono wyłącznie manifestowe `lang/en.json` i `lang/pl.json`,
- tryb `auto` używa `game.i18n.localize/format`, a wymuszone `en`/`pl` korzystają z tych samych plików JSON ładowanych podczas `i18nInit`,
- rejestracja ustawień używa kluczy lokalizacyjnych i odświeża etykiety po załadowaniu wybranego języka,
- formularz zasad nie omija już wymuszonego języka przez bezpośredni helper Handlebars,
- ujednolicono brakujące parametry `dc` i `margin` w angielskim komunikacie wyniku,
- dodano testy identycznych zestawów kluczy, niepustych wartości, zgodności placeholderów, pokrycia literalnych odwołań, braku katalogu w JS oraz wymuszonego języka niezależnego od Foundry.

### 11. Formuła ilości jest stosowana raz na grupę, nie raz na wybór

Status: **naprawione w 0.92.0**.

Uwaga po hotfixie 0.70.1: błąd scalania różnych dokumentów kompendium w jeden stos został naprawiony niezależnie. Ten punkt nadal dotyczy wyłącznie ekonomii `quantityFormula` i wymaga osobnej decyzji projektowej.

`scripts/helpers/search-engine.js:178-190` losuje `quantityFormula` jeden raz dla całej rzadkości, a kolejne zakupy dodają tylko `+1`. Opis ustawienia mówi, że formuła jest używana, gdy dana rzadkość zostaje wybrana. Dla kilku wyborów common obecne zachowanie to np. `1d6 + 4`, a naturalna interpretacja ustawienia to pięć osobnych zastosowań `1d6`.

Do decyzji i poprawy:

- ustalić oczekiwaną ekonomię,
- jeśli formuła jest „na wybór”, wykonać ją dla każdego wyboru i zsumować,
- jeśli jest „na grupę”, zmienić opis UI i dokumentację,
- dodać deterministyczny test obu kosztów i ilości.

Wdrożona poprawka: silnik rarity wydaje Loot Points wybór po wyborze i dla każdego zakupu niezależnie oblicza `quantityFormula`. Losowanie wykorzystuje pozostałe dokumenty danej puli przed powtórzeniem wpisu. Test regresji potwierdza dwa osobne obliczenia ilości i sumę nagród.

### 12. DC i stare `outcomes` są przechowywane, ale nie sterują nagrodą

Status: **naprawione w 1.7.0 zgodnie z wybranym przez właściciela modelem całkowitego wyniku**.

Końcowy wynik rzutu jest bezpośrednio mapowany na progi Loot Points, a następnie obsługiwany przez wybrany silnik rarity lub łącznej wartości. Martwe pola DC, marginesu, `outcomes` i `minMargin` usunięto z aktywnego schematu aktywności, presetów, sesji, logów, UI, komunikatów i lokalizacji. Normalizacja presetów używa jawnej listy dozwolonych pól, więc stare dodatkowe dane są ignorowane i nie wracają przy kolejnym eksporcie. Istniejące dokumenty świata nie są przepisywane.

## P2 — jakość, utrzymanie i dopracowanie

### 13. Zbyt duże pliki i powielona logika UI

Status: **rozwiązane architektonicznie do 1.12.0**.

W 1.5.0 wspólne funkcje DialogV2 przeniesiono do `scripts/dialogs/dialog-utils.js`, History do osobnego renderera, a arkusz Workbench rozdzielono na rdzeń, Presets, History i responsywność. W 1.6.0 wydzielono osobne widoki Launch, Responses i Presets oraz wspólne zasoby ikon. W 1.12.0 powielony przepływ importu/eksportu obu paneli przeniesiono do `config-transfer-dialogs.js`, a prezentację oferty gracza do `player-search-offer-dialog.js`, pozostawiając transport i autorytet sesji w kontrolerze. Monolityczny `module.css` rozdzielono na 179-liniową bazę, 1234 linie wspólnych dialogów GM i 953 linie okien gracza; Workbench, Presets, History i responsywność zachowują osobne warstwy. Wszystkie aktywne zmienne CSS mają prefiks `--wildharvest-*`.

- `gm-control-panel-dialog.js`: 1572 linie,
- `search-offer-dialogs.js`: 1344 linie,
- `settings.js`: około 29 KB,
- `search-dialog.js`: około 29 KB,
- `module.css`: 179 linii wspólnej bazy; style GM i gracza są w osobnych plikach.

Powtarzają się m.in. `getDialogForm`, `escapeHtml`, `addWindowClasses`, renderowanie Actorów, import/eksport konfiguracji i wybór kompendiów.

Do poprawy:

- wydzielić wspólne helpery DialogV2,
- podzielić panel GM na osobne komponenty zakładek,
- rozdzielić sesje, transport, autoryzację i widoki,
- rozdzielić CSS na bazę, GM, gracza, dialogi i responsywność.

### 14. Testy obejmują tylko czystą logikę

Status: **rozwiązane automatycznie do 1.13.0; realne testy runtime pozostają świadomie ręczne**.

Pakiet ma obecnie 96 testów. Poza wcześniejszą ekonomią, lifecycle, settings, migracjami, Actor/Item, dostępnością, granicami DialogV2/CSS i kontraktem publicznego API obejmuje deterministyczny model aktywnego MG, zapasowego MG, dwóch graczy i dwóch osobno posiadanych Actorów, a także kontrakt bezpiecznego odnośnika Ko-fi ograniczonego do panelu MG. Model korzysta bezpośrednio z produkcyjnych helperów uwierzytelnionych żądań User, atomowego claim/completion, odzyskiwania `resolving` oraz autoryzacji socketu. Sprawdza niezależne oferty, odrzucenie cudzego Actora, jednokrotne ukończenie, blokadę powtórzeń, zmianę aktywnego MG, obsługę żądania skierowanego wcześniej do nadal poprawnego konta MG, odzyskanie zapisanego Actor-logu bez kolejnego grantu i izolację komunikatów na konkretnego gracza. Na Foundry 14.360 + dnd5e 5.3.3 wykonano wcześniej lokalny test załadowania modułu, kontrolki sceny, panelu GM i zapisu formularza zasad. Właściciel potwierdza poprawne bieżące działanie 1.8.1; realne przepływy późniejszych warstw pozostają do skupionych testów ręcznych.

Świadomie nie są zastępowane automatem:

- rzeczywista komunikacja aktywnego i zapasowego MG oraz dwóch klientów gracza,
- pełny przepływ DialogV2 z realnym rzutem i przyznaniem łupu,
- live test Foundry 13.351,
- live test Foundry 14.364,
- automatyczny CI, który pozostaje poza zakresem do czasu wznowienia spraw GitHub.

Pozostałe bramki ręczne:

- wykonać macierz z `wildharvest/TESTING.md` na realnych klientach,
- uruchomić Foundry 13.351 i 14.364 przed rozszerzeniem deklaracji manifestu,
- testować dokładnie źródło publikowane, nie starszą kopię,
- CI pozostawić poza zakresem do czasu osobnego wznowienia spraw GitHub.

### 15. Dokumentacja i wydanie są niespójne

Status: **naprawione w 0.99.0 dla lokalnego kandydata wydania**.

Wdrożona poprawka:

- dodano `TESTING.md`, `COMPATIBILITY.md` i `RELEASE-CHECKLIST.md`, a test automatyczny sprawdza lokalne odnośniki Markdown w README,
- changelog, README, roadmapa, audyt, zasady łupu i dokumentacja backupów są zsynchronizowane; pipeline wdrożono w 0.99.0, a aktualna baza ma wersję 1.0.0,
- repozytorium Git i wszystkie narzędzia pracują na jedynym źródle `wildharvest`,
- dodano lokalny, bez-zależnościowy `package.json`, `.editorconfig` i kontrolę UTF-8, końcowych nowych linii oraz białych znaków,
- `tools/build-release.ps1` uruchamia format-check, walidację i 67 testów, po czym pakuje wyłącznie jawną listę plików,
- ZIP nie zawiera już `tests/`, skryptów PowerShell, backupów, metadanych workspace ani zagnieżdżonych archiwów,
- builder rozpakowuje gotową paczkę, sprawdza położenie `wildharvest/module.json`, ID, wersję, zabronione ścieżki i hash każdego z 78 plików,
- wybór licencji pozostaje jawnie niezaznaczoną bramką właściciela przed publiczną dystrybucją; do tego czasu manifest nie udaje, że tekst `MIT` jest ścieżką do licencji,
- CI i zdalna publikacja nadal są świadomie wyłączone do osobnego polecenia dotyczącego GitHub.

### 16. Artefakt kodowania w UI

Status: **naprawione w 0.92.0**.

`scripts/dialogs/gm-control-panel-dialog.js:1703-1707` zawiera `Â·` i próbę naprawy innego wariantu mojibake `Ă‚Â·`. Tekst może wyświetlać błędny znak. Pliki powinny być zapisane jako UTF-8 bez mieszania konwersji.

Artefakt oraz wykonywana w runtime próba `replaceAll` zostały usunięte; podgląd używa zwykłego separatora ASCII.

### 17. Dostępność i ergonomia wymagają testu manualnego

Status: **warstwa techniczna wdrożona w 1.11.0; wizualne testy runtime pozostają ręczne**.

W 1.11.0 wdrożono powiązania `label`/`for` i jawne nazwy kontrolek, ARIA `tablist`/`tab`/`tabpanel`, roving tabindex, nawigację zakładek strzałkami oraz Home/End, `aria-pressed` dla filtrów i selektorów, widoczny `focus-visible`, początkowy fokus okien gracza, bezpieczny powrót fokusu do podłączonego rodzica i reduced motion obejmujące okna gracza. Testy automatyczne wykonują helpery etykiet/fokusu i nawigacji oraz pilnują obecności kontraktu w źródłach.

Do przejścia na Foundry 13 i 14:

- praktyczna obsługa klawiaturą i czytelność fokusu w realnym DOM Foundry,
- odczyt powiązanych etykiet oraz ról/stanu zakładek przez technologię asystującą,
- praktyczny fokus po otwarciu i zamknięciu DialogV2,
- skalowanie przy 1280×720 i powiększeniu 125–200%,
- długie polskie i angielskie nazwy,
- brak przepełnienia tabel i panelu GM.

## P3 — zaplanowane rozszerzenia funkcjonalne

### 18. Alternatywny system łupu oparty na wartości przedmiotów

Status: **wdrożone w 0.92.0 zgodnie z doprecyzowaną ekonomią właściciela projektu**.

W ustawieniach dostępne są dwa niezależne tryby:

- `Rarity` zachowuje dotychczasowe koszty LP, wagi i formuły ilości,
- `Łączna wartość GP` używa tych samych progów rzutu do przyznania LP, a następnie mapuje liczbę LP na edytowalny cel GP dla całego zestawu.

Przykład: jeśli 5 LP ma cel 5 GP, poprawnym wynikiem jest zestaw cen `1 + 2 + 1 + 1 GP`. Domyślna tolerancja ±10% pozwala w tym przykładzie zaakceptować sumę od 4,5 do 5,5 GP. Algorytm jest ograniczony do 100 prób, nigdy nie przekracza górnej tolerancji, preferuje różne dokumenty i zwraca najbliższą dostępną kombinację, jeśli dokładny cel jest nieosiągalny.

Ceny D&D5e są pobierane z `system.price.value` i `system.price.denomination`, a następnie normalizowane do CP: `PP=1000`, `GP=100`, `EP=50`, `SP=10`, `CP=1`. Brakujące, zerowe, ujemne i uszkodzone ceny są wykluczane. Podgląd GM pokazuje cel, sumę, tolerancję, liczbę nieprawidłowych cen i wpisów zbyt drogich dla danego budżetu; wynik gracza pokazuje cenę jednostkową.

Oba silniki zwracają wspólne pola `rewards`, `lootPoints`, `strategy` i `selectionGroups`. Generowanie nadal wykonuje wyłącznie aktywny GM, a socket nie otrzymał danych ekonomicznych. Ustawienia są częścią istniejącego eksportu/importu konfiguracji. Starsza konfiguracja 0.90.0 bez nowych pól jest normalizowana do trybu rarity i domyślnych zasad wartości.

Testy obejmują nominały PP/GP/EP/SP/CP, wartości dziesiętne, dokładny cel z różnych przedmiotów, górny limit tolerancji, brak możliwej kombinacji, wybór właściwego wiersza LP, niezależne obliczanie quantity rarity, różnorodność przedmiotów, zgodność starszej konfiguracji i poprawność grafu importów orkiestratora.

## Zgodność z Foundry VTT 13 i 14

| Obszar | V13 | V14 | Ocena |
|---|---:|---:|---|
| `foundry.applications.api.ApplicationV2` | dostępne | dostępne | OK |
| `foundry.applications.api.DialogV2` | dostępne | dostępne | OK |
| `HandlebarsApplicationMixin` | dostępne | dostępne | OK |
| `getSceneControlButtons` z rekordem controls/tools | dostępne | dostępne | implementacja zgodna |
| `CompendiumCollection#getIndex({fields})` | dostępne | dostępne | implementacja zgodna |
| `foundry.utils.fromUuid` | dostępne | dostępne | implementacja zgodna |
| `Actor#createEmbeddedDocuments("Item", ...)` | dostępne | dostępne | implementacja zgodna |
| kolejność hooków `init → i18nInit → setup → ready` | udokumentowana | udokumentowana | poprawione w 0.40.0 |
| oczekiwanie na asynchroniczny hook | brak | brak | kod nie zakłada oczekiwania przez dispatcher |
| socket `module.{id}` | broadcast | broadcast | payload ograniczony i autoryzowany od 0.70.0 |

Uwagi:

- publiczne powierzchnie używane przez moduł są dostępne w V13 i V14, a testy regresji pilnują ich stabilnych ścieżek,
- lokalnie sprawdzono Foundry 14.360 z dnd5e 5.3.3; manifest nie zawyża pola `verified`,
- Foundry 13.351 oraz 14.364 wymagają jeszcze realnego uruchomienia przed rozszerzeniem deklaracji zgodności lub publiczną dystrybucją,
- relacja manifestu deklaruje dnd5e minimum 5.3.0 i verified 5.3.3; oficjalna linia dnd5e 5.3 wspiera Foundry 13 i 14,
- szczegółowa macierz i pozostałe scenariusze znajdują się w `wildharvest/COMPATIBILITY.md` oraz `wildharvest/TESTING.md`.
- automatyczna macierz 1.13.0 sprawdza spójność powyższych wersji z manifestem, ale nie oznacza realnego uruchomienia Foundry 13.351 ani 14.364.

Źródła Foundry:

- https://foundryvtt.com/api/v13/modules/hookEvents.html
- https://foundryvtt.com/api/v14/modules/hookEvents.html
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
- https://foundryvtt.com/api/v14/classes/foundry.applications.api.ApplicationV2.html
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
- https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html
- https://foundryvtt.com/api/v13/classes/foundry.documents.collections.CompendiumCollection.html
- https://foundryvtt.com/api/v14/classes/foundry.documents.collections.CompendiumCollection.html
- https://foundryvtt.com/article/module-development/
- https://foundryvtt.com/article/package-management/

## Pełna lista migracji nazwy na Wildharvest

Status: **ukończone w 0.90.0 jako czysty rename bez migracji dawnych światów**.

Docelowe nazwy:

- nazwa widoczna: `Wildharvest`,
- techniczne ID, jeśli ma zostać zmienione: `wildharvest`,
- folder modułu: `wildharvest`,
- repozytorium i release: `Wildharvest`,
- ZIP: `Wildharvest-X.Y.Z.zip`,
- format eksportu: wyłącznie `wildharvest-config`.

Zakres mechaniczny w kopii 0.30.3:

- około 38 wystąpień `ghateret` w 6 plikach,
- około 154 samodzielnych wystąpień słowa `gathering` w 9 plikach,
- około 848 wystąpień `poszukiwania` w 11 plikach,
- 28 twardych ścieżek `modules/ghateret/...`,
- 1798 wystąpień starego prefiksu `POSZ.` w kodzie, HBS i tłumaczeniach.

Checklista:

1. Utworzyć backup świata i eksport ustawień.
2. Ustalić jedno źródło `wildharvest/`.
3. Zmienić manifest: `id`, `title`, opis, URL, manifest, download, readme, changelog.
4. Dopasować nazwę folderu do `id`.
5. Zastąpić twarde ścieżki assetów ścieżkami budowanymi z jednej stałej.
6. Zmienić widoczne teksty w EN i PL na Wildharvest.
7. Zmienić klasy CSS `poszukiwania-*` na jeden nowy prefiks, np. `wildharvest-*`.
8. Zmienić klucze i18n `POSZ.*` na `WILDHARVEST.*` albo krótszy jednoznaczny prefiks.
9. Zmienić socket namespace przez nowe `MODULE_ID`.
10. Zmienić Application IDs, template paths i selektory.
11. Zmienić format eksportu na `wildharvest-config` bez importera dawnych formatów.
12. Rozpocząć od czystych settings i flag `wildharvest`, bez migracji dawnych namespace’ów.
13. Zmienić README, changelog, skrypty PowerShell, nazwy testów, backupów i archiwów.
14. Zmianę zdalnego repozytorium i linków release pozostawić wyłączoną do osobnego polecenia właściciela.
15. Dodać kontrolę `rg -i "poszukiwania|ghateret|gathering"` z celowymi wyjątkami tylko w migratorze i changelogu.
16. Pełną zmianę ID traktować jako świadomie nowy pakiet bez kompatybilności danych z dawnymi światami.

## Lista usunięcia `gathering-content`

Status: **ukończone w 0.85.0**.

Do usunięcia z aktywnego projektu:

- katalog `gathering-content/`,
- `tools/create-content-module-backup.ps1`,
- rekomendacja modułu w starszym `poszukiwania/module.json`,
- wszystkie instrukcje instalacji i opisy w głównym README oraz README modułu,
- wpis w `BACKUPS.md`,
- stare sample i domyślne `packId` w kopii 0.30.0,
- aktywna logika, która zakłada obecność `gathering-content`.

Wdrożona zmiana:

- wszystkie powyższe aktywne elementy zostały usunięte,
- główny moduł nie zawiera ani nie rekomenduje żadnego companion content,
- GM wybiera kompendia Item ze świata, systemu lub innego niezależnego źródła,
- pozostające wystąpienia starej nazwy są ograniczone do historii, dokumentacji migracji, migratora v4 i jego testów.

Usunięte redundantne kopie:

- `backups/gathering-content-v0.1.0/`,
- `backups/gathering-content-v0.1.0.zip`.

Przed usunięciem zapisano jedno końcowe archiwum `backups/retired-gathering-content-0.2.0-stage-09-pre-removal.zip`. Jest lokalne, wyłączone z Git i nie stanowi aktywnego projektu.

Bezpieczna migracja świata po usunięciu:

1. Zrobić eksport konfiguracji.
2. Znaleźć wszystkie `packId` zaczynające się od `gathering-content.`.
3. Usunąć wyłącznie te identyfikatory.
4. Zachować resztę presetów i pul.
5. Oznaczyć presety bez kompendium jako „wymaga konfiguracji”.
6. Wyświetlić GM raport migracji.
7. Nie zerować całych `locations`, `lootPools` ani fallbacku.

## Zalecana kolejność prac

1. Ustalić jedno źródło prawdy i działające repozytorium Git.
2. Napisać testy migracji oraz backup danych.
3. Naprawić destrukcyjną migrację `gathering-content`.
4. Naprawić `async init`.
5. Przenieść autorytet wyniku/nagród do GM i zablokować duplikaty.
6. Usunąć przywracanie zużytych ilości.
7. Naprawić socket i obsługę wielu GM.
8. Uprościć i18n do jednego źródła.
9. Usunąć `gathering-content` i wszystkie aktywne odwołania.
10. Wykonać migrację brandingu do Wildharvest razem z migracją danych.
11. Rozbić duże pliki, dodać wybierany system łupu oparty na wartości przedmiotów i rozszerzyć testy obu silników.
12. Zweryfikować publiczne API Foundry 13/14, przypisać wspieraną linię dnd5e i wykonać dostępny test runtime; brakujące uruchomienia 13.351/14.364 zachować jako bramki przed szerszą deklaracją zgodności.
13. Naprawić dokumentację, changelog i lokalny pipeline wydania — ukończone w 0.99.0.
14. Zbudować i zweryfikować czysty lokalny ZIP 1.0.0; nie konfigurować zdalnego hostingu bez osobnego polecenia — ukończone jako prywatna lokalna baza 1.0.0.
