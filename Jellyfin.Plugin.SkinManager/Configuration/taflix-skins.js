export default function (view) {
    var pluginId = 'e9ca8b8e-ca6d-40e7-85dc-58e536df8eb3';
    var select = view.querySelector('#cssOptions');
    var description = view.querySelector('#skinDescription');
    var status = view.querySelector('#skinStatus');
    var submit = view.querySelector('#setSkin');
    var retry = view.querySelector('#retrySkins');
    var skins = [];
    var busy = false;

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

    view.querySelector('#taflixSkinsForm').addEventListener('submit', async function (event) {
        event.preventDefault();
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
            status.textContent = skin.name + ' applied. Reload the web app to see the skin.';
        } catch (error) {
            status.textContent = 'Could not finish saving the skin. Check Branding CSS and try again.';
            console.error('taflix Skins could not save', error);
        } finally {
            busy = false;
            select.disabled = false;
            submit.disabled = false;
            Dashboard.hideLoadingMsg();
        }
    });
    select.addEventListener('change', describeSkin);
    retry.addEventListener('click', loadSkins);
    view.addEventListener('viewshow', loadSkins);
}
