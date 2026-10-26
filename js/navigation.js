/**
 * MindForge navigation
 * Hash-based single-page routing, active-link state, focus management and a
 * responsive off-canvas sidebar with a keyboard focus trap.
 */
(function (global) {
  'use strict';

  var views = Object.create(null);
  var viewOrder = [];
  var currentView = null;
  var sidebarOpen = false;

  var sidebar = document.getElementById('sidebar');
  var menuToggle = document.getElementById('menu-toggle');
  var sidebarClose = document.getElementById('sidebar-close');
  var scrim = document.getElementById('sidebar-scrim');
  var currentSectionLabel = document.getElementById('current-section');
  var mainContent = document.getElementById('main-content');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link[data-nav]'));
  var mobileQuery = global.matchMedia('(max-width: 1140px)');

  function titleCase(value) {
    return value
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, function (letter) {
        return letter.toUpperCase();
      });
  }

  function resolveHashView() {
    var hash = global.location.hash.replace(/^#\/?/, '');

    if (!hash) {
      return null;
    }

    try {
      hash = decodeURIComponent(hash);
    } catch (error) {
      return null;
    }

    return views[hash] ? hash : null;
  }

  function setUrl(id) {
    if (global.location.hash === '#' + id) {
      return;
    }

    try {
      global.history.pushState({ view: id }, '', '#' + id);
    } catch (error) {
      global.location.hash = id;
    }
  }

  function replaceUrl(id) {
    try {
      global.history.replaceState({ view: id }, '', '#' + id);
    } catch (error) {
      /* Some local file contexts block history updates. The view still works. */
    }
  }

  function focusHeading(view) {
    var heading = view.querySelector('h1') || view.querySelector('h2');

    if (!heading) {
      return;
    }

    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  function updateNav(id) {
    navLinks.forEach(function (link) {
      if (link.dataset.nav === id) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    if (currentSectionLabel) {
      currentSectionLabel.textContent = views[id].title;
    }

    document.title = 'MindForge — ' + views[id].title;
    document.body.dataset.view = id;
  }

  function showView(id, options) {
    var settings = options || {};
    var nextView = views[id];

    if (!nextView) {
      return;
    }

    if (currentView === id) {
      if (settings.focus) {
        focusHeading(nextView.element);
      }
      if (settings.scroll !== false) {
        global.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      return;
    }

    viewOrder.forEach(function (viewId) {
      var view = views[viewId].element;
      var isNext = viewId === id;

      view.hidden = !isNext;
      view.classList.toggle('is-active', isNext);
    });

    currentView = id;
    updateNav(id);
    closeSidebar(false);

    if (settings.scroll !== false) {
      global.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    if (settings.focus) {
      focusHeading(nextView.element);
    }

    document.dispatchEvent(
      new CustomEvent('mindforge:viewchange', {
        detail: { view: id, title: nextView.title }
      })
    );
  }

  function navigate(id, options) {
    var settings = options || {};

    if (!views[id]) {
      return;
    }

    closeSidebar(false);
    setUrl(id);
    showView(id, { focus: settings.focus !== false, scroll: true });
  }

  function routeFromLocation(options) {
    var id = resolveHashView();

    if (!id) {
      if (currentView) {
        return;
      }
      id = 'dashboard';
    }

    showView(id, {
      focus: Boolean(currentView),
      scroll: true
    });
  }

  function getFocusable(container) {
    var selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return Array.prototype.filter.call(container.querySelectorAll(selector), function (element) {
      return element.offsetParent !== null || element === document.activeElement;
    });
  }

  function handleDrawerKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSidebar(true);
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    var focusable = getFocusable(sidebar);

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey && (document.activeElement === first || document.activeElement === sidebar)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openSidebar() {
    if (!mobileQuery.matches || sidebarOpen) {
      return;
    }

    sidebarOpen = true;
    document.body.classList.add('nav-open');
    sidebar.classList.add('is-open');
    sidebar.inert = false;
    sidebar.removeAttribute('aria-hidden');

    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'true');
    }

    if (scrim) {
      scrim.setAttribute('aria-hidden', 'false');
    }

    document.addEventListener('keydown', handleDrawerKeydown);

    if (sidebarClose) {
      sidebarClose.focus();
    }
  }

  function closeSidebar(returnFocus) {
    var wasOpen = sidebarOpen;
    sidebarOpen = false;
    document.body.classList.remove('nav-open');

    if (sidebar) {
      sidebar.classList.remove('is-open');
    }

    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'false');
    }

    if (scrim) {
      scrim.setAttribute('aria-hidden', 'true');
    }

    document.removeEventListener('keydown', handleDrawerKeydown);

    if (mobileQuery.matches && sidebar) {
      sidebar.inert = true;
      sidebar.setAttribute('aria-hidden', 'true');
    }

    if (wasOpen && returnFocus && menuToggle) {
      menuToggle.focus();
    }
  }

  function syncSidebarMode() {
    if (mobileQuery.matches) {
      if (!sidebarOpen) {
        sidebar.classList.remove('is-open');
        sidebar.inert = true;
        sidebar.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    sidebarOpen = false;
    document.body.classList.remove('nav-open');
    document.removeEventListener('keydown', handleDrawerKeydown);
    sidebar.classList.remove('is-open');
    sidebar.inert = false;
    sidebar.removeAttribute('aria-hidden');

    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function handleNavClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    var link = event.target.closest('[data-nav]');

    if (!link) {
      return;
    }

    var id = link.dataset.nav;

    if (!views[id]) {
      return;
    }

    event.preventDefault();
    navigate(id);
  }

  function init() {
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));

    sections.forEach(function (section) {
      var id = section.dataset.view;
      var title = section.dataset.title || titleCase(id);
      var heading = section.querySelector('h1');

      if (heading && !heading.id) {
        heading.id = id + '-title';
      }

      views[id] = {
        element: section,
        title: title
      };
      viewOrder.push(id);
    });

    if (!viewOrder.length) {
      return;
    }

    document.addEventListener('click', handleNavClick);

    if (menuToggle) {
      menuToggle.addEventListener('click', function () {
        if (sidebarOpen) {
          closeSidebar(true);
        } else {
          openSidebar();
        }
      });
    }

    if (sidebarClose) {
      sidebarClose.addEventListener('click', function () {
        closeSidebar(true);
      });
    }

    if (scrim) {
      scrim.addEventListener('click', function () {
        closeSidebar(true);
      });
    }

    var skipLink = document.querySelector('.skip-link');
    if (skipLink && mainContent) {
      skipLink.addEventListener('click', function (event) {
        event.preventDefault();
        mainContent.focus();
      });
    }

    global.addEventListener('popstate', function () {
      routeFromLocation();
    });

    global.addEventListener('hashchange', function () {
      routeFromLocation();
    });

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncSidebarMode);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(syncSidebarMode);
    }

    syncSidebarMode();

    var initialId = resolveHashView();

    if (!initialId) {
      initialId = 'dashboard';
      replaceUrl(initialId);
    }

    showView(initialId, { focus: false, scroll: false });
  }

  global.MindForgeNavigation = Object.freeze({
    goTo: function (id) {
      navigate(id, { focus: true });
    },
    getCurrent: function () {
      return currentView;
    },
    closeSidebar: function () {
      closeSidebar(true);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
