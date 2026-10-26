/**
 * MindForge theme controller
 * Restores the saved theme, keeps the header toggle and settings options in
 * sync, follows the OS preference when no explicit choice exists, and mirrors
 * changes between tabs.
 */
(function (global) {
  'use strict';

  var storage = global.MindForgeStorage;
  var root = document.documentElement;
  var systemQuery = global.matchMedia('(prefers-color-scheme: dark)');
  var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-theme-toggle]'));
  var labels = Array.prototype.slice.call(document.querySelectorAll('[data-theme-label]'));
  var options = Array.prototype.slice.call(document.querySelectorAll('[data-theme-option]'));
  var metaThemeColor = document.querySelector('meta[name="theme-color"]');

  var themeMeta = {
    light: '#f4f0e8',
    dark: '#111210'
  };

  var saved = storage ? storage.get('theme', null) : null;
  var hasExplicitPreference = saved === 'light' || saved === 'dark';
  var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function updateInterface(theme) {
    var isDark = theme === 'dark';
    var action = isDark ? 'Switch to light theme' : 'Switch to dark theme';

    root.setAttribute('data-theme', theme);

    toggles.forEach(function (toggle) {
      toggle.setAttribute('aria-label', action);
      toggle.setAttribute('title', action);
    });

    labels.forEach(function (label) {
      label.textContent = isDark ? 'Dark' : 'Light';
    });

    options.forEach(function (option) {
      var isCurrent = option.value === theme;
      option.checked = isCurrent;
      if (isCurrent) {
        option.setAttribute('aria-current', 'true');
      } else {
        option.removeAttribute('aria-current');
      }
    });

    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeMeta[theme]);
    }
  }

  function announce(theme, persist) {
    current = theme;

    if (persist) {
      hasExplicitPreference = true;
      if (storage) {
        storage.set('theme', theme);
      }
    }

    updateInterface(theme);

    document.dispatchEvent(
      new CustomEvent('mindforge:themechange', {
        detail: { theme: theme, stored: hasExplicitPreference }
      })
    );
  }

  function setTheme(theme, persist) {
    if (theme !== 'light' && theme !== 'dark') {
      return;
    }

    var shouldPersist = persist !== false;

    if (theme === current) {
      if (shouldPersist && !hasExplicitPreference) {
        announce(theme, true);
      } else {
        updateInterface(theme);
      }
      return;
    }

    announce(theme, shouldPersist);
  }

  function toggleTheme() {
    setTheme(current === 'dark' ? 'light' : 'dark', true);
  }

  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', toggleTheme);
  });

  options.forEach(function (option) {
    option.addEventListener('change', function () {
      if (option.checked) {
        setTheme(option.value, true);
      }
    });
  });

  systemQuery.addEventListener('change', function (event) {
    if (!hasExplicitPreference) {
      announce(event.matches ? 'dark' : 'light', false);
    }
  });

  global.addEventListener('storage', function (event) {
    if (event.key !== 'mindforge:theme') {
      return;
    }

    if (event.newValue === null) {
      hasExplicitPreference = false;
      announce(systemQuery.matches ? 'dark' : 'light', false);
      return;
    }

    var nextTheme;
    try {
      nextTheme = JSON.parse(event.newValue);
    } catch (error) {
      nextTheme = event.newValue;
    }

    if (nextTheme === 'light' || nextTheme === 'dark') {
      hasExplicitPreference = true;
      if (nextTheme !== current) {
        announce(nextTheme, false);
      }
    }
  });

  // The inline head script has already applied the correct theme. Account for
  // a stale saved value here so the settings UI always matches what is shown.
  if (!hasExplicitPreference) {
    announce(systemQuery.matches ? 'dark' : 'light', false);
  } else {
    updateInterface(current);
  }

  global.MindForgeTheme = Object.freeze({
    get: function () {
      return current;
    },
    set: function (theme) {
      setTheme(theme, true);
    },
    toggle: toggleTheme
  });
})(window);
