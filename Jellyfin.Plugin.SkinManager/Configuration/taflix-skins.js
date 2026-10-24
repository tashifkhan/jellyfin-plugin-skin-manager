export default function (view) {
    var pluginId = 'e9ca8b8e-ca6d-40e7-85dc-58e536df8eb3';
    var select = view.querySelector('#cssOptions');
    var description = view.querySelector('#skinDescription');
    var status = view.querySelector('#skinStatus');
    var submit = view.querySelector('#setSkin');
    var retry = view.querySelector('#retrySkins');
    var skins = [];
    var busy = false;

    // Jellyfin 12 keeps its query cache in IndexedDB and reuses Branding CSS
    // for up to a minute after a reload. Drop that entry so Home fetches the new skin.
    function forgetCachedBranding() {
        return new Promise(function (resolve) {
            var open = indexedDB.open('keyval-store');
            open.onerror = function () { resolve(); };
            open.onsuccess = function () {
                var db = open.result;
                if (!db.objectStoreNames.contains('keyval')) {
                    db.close();
                    resolve();
                    return;
                }
                var tx = db.transaction('keyval', 'readwrite');
                var store = tx.objectStore('keyval');
                var get = store.get('jellyfin-query-cache');
                get.onsuccess = function () {
                    var cache = get.result;
                    var queries = cache && cache.clientState && cache.clientState.queries;
                    if (Array.isArray(queries)) {
                        cache.clientState.queries = queries.filter(function (query) {
                            return !(query.queryKey && query.queryKey[0] === 'BrandingOptions');
                        });
                        store.put(cache, 'jellyfin-query-cache');
                    }
                };
                tx.oncomplete = tx.onerror = tx.onabort = function () {
                    db.close();
                    resolve();
                };
            };
        });
    }

    function describeSkin() {
        var skin = skins.find(function (item) { return item.defaultCss === select.value; });
        description.textContent = skin ? skin.description : '';
    }

    async function loadSkins() {
        if (busy) return;
        busy = true;
        select.disabled = true;
        submit.disabled = true;
        retry.classList.add('hide');
        status.textContent = '';
        Dashboard.showLoadingMsg();
        try {
            var results = await Promise.all([
                ApiClient.ajax({
                    type: 'GET',
                    url: ApiClient.getUrl('web/ConfigurationPage', { name: 'taflix-skins.json' }),
                    dataType: 'json'
                }),
                ApiClient.getNamedConfiguration('branding'),
                ApiClient.getPluginConfiguration(pluginId)
            ]);
            skins = results[0];
            if (!Array.isArray(skins) || !skins.length || skins.some(function (skin) {
                return !skin.name || typeof skin.defaultCss !== 'string' || !skin.defaultCss.trim();
            })) throw new Error('Invalid skin list');
            select.replaceChildren();
            skins.forEach(function (skin) {
                var option = document.createElement('option');
                option.textContent = skin.name;
                option.value = skin.defaultCss;
                select.appendChild(option);
            });
            var currentCss = results[1].CustomCss || '';
            var active = skins.find(function (skin) {
                return skin.defaultCss.trim() === currentCss.trim();
            });
            var saved = skins.find(function (skin) {
                return skin.defaultCss === results[2].selectedSkin;
            });
            select.value = (active || saved || skins[0]).defaultCss;
            describeSkin();
            select.disabled = false;
            submit.disabled = false;
        } catch (error) {
            status.textContent = 'Could not load skins. Check the server connection and retry.';
            retry.classList.remove('hide');
            console.error('taflix Skins could not load', error);
        } finally {
            busy = false;
            Dashboard.hideLoadingMsg();
        }
    }

    async function applySkin(event) {
        if (event) event.preventDefault();
        if (busy || submit.disabled) return;
        busy = true;
        select.disabled = true;
        submit.disabled = true;
        status.textContent = '';
        Dashboard.showLoadingMsg();
        try {
            var skin = skins.find(function (item) { return item.defaultCss === select.value; });
            if (!skin) throw new Error('Select a skin');
            var branding = await ApiClient.getNamedConfiguration('branding');
            branding.CustomCss = skin.defaultCss;
            await ApiClient.updateNamedConfiguration('branding', branding);
            var config = await ApiClient.getPluginConfiguration(pluginId);
            config.selectedSkin = skin.defaultCss;
            config.options = [];
            await ApiClient.updatePluginConfiguration(pluginId, config);
            status.textContent = skin.name + ' saved. Opening Home...';
            await forgetCachedBranding();
            window.location.hash = '/home';
            window.location.reload();
        } catch (error) {
            status.textContent = 'Could not finish saving the skin. Check Branding CSS and try again.';
            console.error('taflix Skins could not save', error);
        } finally {
            busy = false;
            select.disabled = false;
            submit.disabled = false;
            Dashboard.hideLoadingMsg();
        }
    }
    view.querySelector('#taflixSkinsForm').addEventListener('submit', applySkin);
    select.addEventListener('change', function () {
        describeSkin();
        applySkin();
    });
    retry.addEventListener('click', loadSkins);
    view.addEventListener('viewshow', loadSkins);
}
