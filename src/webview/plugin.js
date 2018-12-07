import { ipcRenderer } from 'electron';
import path from 'path';
import { observable } from 'mobx';

import RecipeWebview from './lib/RecipeWebview';

import spellchecker, { switchDict, disable as disableSpellchecker } from './spellchecker';
import { injectDarkModeStyle, isDarkModeStyleInjected, removeDarkModeStyle } from './darkmode';
import contextMenu from './contextMenu';
import './notifications';

const debug = require('debug')('Franz:Plugin');

window.franzSettings = {};
let serviceData;
let overrideSpellcheckerLanguage = false;


ipcRenderer.on('initializeRecipe', (e, data) => {
  const modulePath = path.join(data.recipe.path, 'webview.js');
  // Delete module from cache
  delete require.cache[require.resolve(modulePath)];
  try {
    // eslint-disable-next-line
    require(modulePath)(new RecipeWebview(), data);
    debug('Initialize Recipe', data);

    serviceData = data;

    if (data.isDarkModeEnabled) {
      injectDarkModeStyle(data.recipe.path);
      debug('Add dark theme styles');
    }

    if (data.spellcheckerLanguage) {
      debug('Overriding spellchecker language to', data.spellcheckerLanguage);
      switchDict(data.spellcheckerLanguage);

      overrideSpellcheckerLanguage = true;
    }
  } catch (err) {
    debug('Recipe initialization failed', err);
  }
});

// Needs to run asap to intialize dictionaries
(async () => {
  const spellcheckingProvider = await spellchecker();
  contextMenu(spellcheckingProvider);
})();

ipcRenderer.on('settings-update', async (e, data) => {
  debug('Settings update received', data);

  if (!data.enableSpellchecking) {
    disableSpellchecker();
  } else if (!overrideSpellcheckerLanguage) {
    debug('Setting spellchecker language based on app settings to', data.spellcheckerLanguage);
    switchDict(data.spellcheckerLanguage);
  }

  window.franzSettings = data;
});

ipcRenderer.on('service-settings-update', (e, data) => {
  debug('Service settings update received', data);

  serviceData = data;

  if (data.isDarkModeEnabled && !isDarkModeStyleInjected()) {
    injectDarkModeStyle(serviceData.recipe.path);

    debug('Enable service dark mode');
  } else if (!data.isDarkModeEnabled && isDarkModeStyleInjected()) {
    removeDarkModeStyle();

    debug('Disable service dark mode');
  }

  if (data.spellcheckerLanguage) {
    debug('Overriding spellchecker language to', data.spellcheckerLanguage);
    switchDict(data.spellcheckerLanguage);

    overrideSpellcheckerLanguage = true;
  } else {
    debug('Going back to default spellchecker language to', window.franzSettings.spellcheckerLanguage);
    switchDict(window.franzSettings.spellcheckerLanguage);

    overrideSpellcheckerLanguage = false;
  }
});

// Needed for current implementation of electrons 'login' event 🤦‍
ipcRenderer.on('get-service-id', (event) => {
  debug('Asking for service id', event);

  event.sender.send('service-id', serviceData.id);
});


document.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.sendToHost('hello');
}, false);

// Patching window.open
const originalWindowOpen = window.open;

window.open = (url, frameName, features) => {
  // We need to differentiate if the link should be opened in a popup or in the systems default browser
  if (!frameName && !features) {
    return ipcRenderer.sendToHost('new-window', url);
  }

  return originalWindowOpen(url, frameName, features);
};
