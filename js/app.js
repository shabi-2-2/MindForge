/**
 * MindForge dashboard
 * Renders all workspace data, derives dashboard statistics from the mock
 * fixtures, and wires up the small set of interactions available in Phase 0.
 */
(function (global) {
  'use strict';

  var data = global.MindForgeData;

  if (!data) {
    return;
  }

  var DAY_MS = 24 * 60 * 60 * 1000;
  var dateFormatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  var shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  var compactDateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short'
  });
  var weekdayFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

  var typeIcons = {
    Reading: 'book',
    Quiz: 'check-circle',
    Flashcards: 'cards'
  };

  var toastTimer = null;

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function sum(values) {
    return values.reduce(function (total, value) {
      return total + value;
    }, 0);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatMinutes(totalMinutes) {
    var minutes = Math.round(totalMinutes);

    if (minutes < 60) {
      return minutes + ' min';
    }

    var hours = Math.floor(minutes / 60);
    var remainder = minutes % 60;

    return remainder ? hours + 'h ' + remainder + 'm' : hours + 'h';
  }

  function dateFromDaysAgo(days) {
    var date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date;
  }

  function relativeDay(days) {
    if (days === 0) {
      return 'Today';
    }

    if (days === 1) {
      return 'Yesterday';
    }

    if (days < 7) {
      return days + ' days ago';
    }

    if (days < 14) {
      return 'Last week';
    }

    return compactDateFormatter.format(dateFromDaysAgo(days));
  }

  function typeSlug(type) {
    return type.toLowerCase();
  }

  function createIcon(name, className) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    use.setAttribute('href', '#icon-' + name);
    svg.appendChild(use);

    return svg;
  }

  function computeStats() {
    var sessions = data.sessions;
    var quizzes = sessions.filter(function (session) {
      return typeof session.score === 'number';
    });
    var scores = quizzes.map(function (quiz) {
      return quiz.score;
    });
    var weekSessions = sessions.filter(function (session) {
      return session.daysAgo <= 6;
    });
    var weekActivity = data.activity.filter(function (day) {
      return day.daysAgo <= 6;
    });
    var previousActivity = data.activity.filter(function (day) {
      return day.daysAgo >= 7 && day.daysAgo <= 13;
    });
    var minutesThisWeek = sum(
      weekActivity.map(function (day) {
        return day.minutes;
      })
    );
    var previousMinutes = sum(
      previousActivity.map(function (day) {
        return day.minutes;
      })
    );
    var mastered = sum(
      data.decks.map(function (deck) {
        return deck.mastered;
      })
    );
    var totalCards = sum(
      data.decks.map(function (deck) {
        return deck.total;
      })
    );

    return {
      totalSessions: sessions.length,
      totalMinutes: sum(
        sessions.map(function (session) {
          return session.duration;
        })
      ),
      quizzesCompleted: quizzes.length,
      averageScore: scores.length ? Math.round(sum(scores) / scores.length) : 0,
      topScore: scores.length ? Math.max.apply(null, scores) : 0,
      quizSubjects: new Set(
        quizzes.map(function (quiz) {
          return quiz.subject;
        })
      ).size,
      masteredCards: mastered,
      totalCards: totalCards,
      cardProgress: totalCards ? Math.round((mastered / totalCards) * 100) : 0,
      weekSessions: weekSessions.length,
      minutesThisWeek: minutesThisWeek,
      previousMinutes: previousMinutes,
      activityTrend: previousMinutes
        ? Math.round(((minutesThisWeek - previousMinutes) / previousMinutes) * 100)
        : 0,
      dailyAverage: weekActivity.length ? Math.round(minutesThisWeek / 7) : 0,
      streak: data.user.streak
    };
  }

  function renderStats(stats) {
    var values = {
      sessions: stats.totalSessions,
      quizzes: stats.quizzesCompleted,
      score: stats.averageScore,
      cards: stats.masteredCards
    };

    Object.keys(values).forEach(function (key) {
      var element = $('[data-stat="' + key + '"]');
      if (element) {
        element.textContent = values[key];
      }
    });

    var sessionsNote = $('[data-stat-note="sessions"]');
    if (sessionsNote) {
      sessionsNote.textContent = stats.weekSessions + ' in the last 7 days';
    }

    var quizNote = $('[data-stat-note="quizzes"]');
    if (quizNote) {
      quizNote.textContent = 'Across ' + stats.quizSubjects + ' subjects';
    }

    var scoreNote = $('[data-stat-note="score"]');
    if (scoreNote) {
      scoreNote.textContent = 'Best score ' + stats.topScore + '%';
    }

    var cardsNote = $('[data-stat-note="cards"]');
    if (cardsNote) {
      cardsNote.textContent = stats.cardProgress + '% of ' + stats.totalCards + ' cards';
    }

    var meter = $('[data-stat-meter="cards"]');
    if (meter) {
      meter.style.width = clamp(stats.cardProgress, 0, 100) + '%';
      meter.parentElement.setAttribute(
        'aria-label',
        stats.masteredCards + ' of ' + stats.totalCards + ' flashcards mastered'
      );
    }
  }

  function renderWelcome(stats) {
    var firstName = data.user.firstName;
    var heroName = $('[data-user-first-name]');
    var messages = {
      default:
        'This week you have shaped ' +
        formatMinutes(stats.minutesThisWeek) +
        ' of focus across ' +
        stats.weekSessions +
        ' sessions. ' +
        (stats.weekSessions >= data.weeklyGoal.sessions
          ? 'Your weekly goal is complete — keep the momentum steady.'
          : 'One more focused session will complete your weekly goal.')
    };

    if (heroName) {
      heroName.textContent = firstName;
    }

    $all('[data-user-name]').forEach(function (element) {
      element.textContent = data.user.name;
    });

    $all('[data-user-initials]').forEach(function (element) {
      element.textContent = data.user.initials;
    });

    $all('[data-user-plan]').forEach(function (element) {
      element.textContent = data.user.plan;
    });

    $all('[data-streak]').forEach(function (element) {
      element.textContent = stats.streak;
    });

    var welcomeDate = $('[data-welcome-date]');
    if (welcomeDate) {
      welcomeDate.textContent = dateFormatter.format(new Date());
    }

    var topbarDate = $('[data-topbar-date]');
    if (topbarDate) {
      topbarDate.textContent = shortDateFormatter.format(new Date());
    }

    var welcomeMessage = $('[data-welcome-message]');
    if (welcomeMessage) {
      welcomeMessage.textContent = messages.default;
    }
  }

  function renderTodayFocus() {
    var today = data.activity.find(function (day) {
      return day.daysAgo === 0;
    });
    var minutes = today ? today.minutes : 0;
    var goal = data.weeklyGoal.dailyMinutes;
    var percent = goal ? Math.round((minutes / goal) * 100) : 0;
    var dial = $('[data-focus-dial]');
    var value = $('[data-focus-percent]');
    var detail = $('[data-focus-minutes]');
    var goalLabel = $('[data-focus-goal]');

    if (dial) {
      dial.style.setProperty('--dial-progress', clamp(percent, 0, 100) + '%');
      dial.setAttribute(
        'aria-label',
        "Today's focus: " + minutes + ' of ' + goal + ' minutes (' + percent + '%)'
      );
    }

    if (value) {
      value.textContent = percent + '%';
    }

    if (detail) {
      detail.textContent = minutes + ' min';
    }

    if (goalLabel) {
      goalLabel.textContent = goal + ' min';
    }
  }

  function renderActivity(stats) {
    var chart = $('[data-activity-chart]');
    var days = data.activity
      .filter(function (day) {
        return day.daysAgo <= 6;
      })
      .slice()
      .sort(function (a, b) {
        return b.daysAgo - a.daysAgo;
      });
    var maxMinutes = Math.max.apply(
      null,
      days.map(function (day) {
        return day.minutes;
      })
    );
    var scale = Math.max(60, Math.ceil(maxMinutes / 30) * 30);
    var totalLabel = $('[data-activity-total]');
    var trendLabel = $('[data-activity-trend]');
    var peakLabel = $('[data-activity-peak]');
    var averageLabel = $('[data-activity-average]');
    var summary = days
      .map(function (day) {
        var date = dateFromDaysAgo(day.daysAgo);
        return dateFormatter.format(date) + ': ' + day.minutes + ' minutes';
      })
      .join('. ');
    var peak = days.reduce(function (top, day) {
      return day.minutes > top.minutes ? day : top;
    }, days[0]);

    if (totalLabel) {
      totalLabel.textContent = formatMinutes(stats.minutesThisWeek);
    }

    if (trendLabel) {
      trendLabel.textContent =
        (stats.activityTrend > 0 ? '+' : '') + stats.activityTrend + '%';
      trendLabel.classList.toggle('trend--up', stats.activityTrend > 0);
      trendLabel.classList.toggle('trend--down', stats.activityTrend < 0);
    }

    if (peakLabel) {
      peakLabel.textContent =
        weekdayFormatter.format(dateFromDaysAgo(peak.daysAgo)) + ' · ' + peak.minutes + ' min';
    }

    if (averageLabel) {
      averageLabel.textContent = formatMinutes(stats.dailyAverage) + '/day';
    }

    if (!chart) {
      return;
    }

    chart.innerHTML = '';
    chart.setAttribute(
      'role',
      'img'
    );
    chart.setAttribute('aria-label', 'Study activity over the last seven days. ' + summary);

    var axis = document.createElement('div');
    axis.className = 'chart__axis';
    axis.setAttribute('aria-hidden', 'true');

    for (var step = 4; step >= 0; step -= 1) {
      var axisLabel = document.createElement('span');
      axisLabel.textContent = Math.round((scale / 4) * step) + 'm';
      axis.appendChild(axisLabel);
    }

    var plot = document.createElement('div');
    plot.className = 'chart__plot';

    var grid = document.createElement('div');
    grid.className = 'chart__grid';
    grid.setAttribute('aria-hidden', 'true');

    for (var line = 0; line < 5; line += 1) {
      grid.appendChild(document.createElement('span'));
    }

    var bars = document.createElement('div');
    bars.className = 'chart__bars';
    bars.setAttribute('aria-hidden', 'true');

    days.forEach(function (day, index) {
      var date = dateFromDaysAgo(day.daysAgo);
      var column = document.createElement('div');
      column.className = 'chart__col' + (day.daysAgo === 0 ? ' is-today' : '');
      column.style.setProperty('--bar-delay', index * 55 + 'ms');

      var track = document.createElement('div');
      track.className = 'chart__track';

      var bar = document.createElement('div');
      bar.className = 'chart__bar';
      bar.style.setProperty('--bar-height', clamp((day.minutes / scale) * 100, 2, 100) + '%');
      bar.title =
        dateFormatter.format(date) + ': ' + day.minutes + ' minutes of focus';

      var tooltip = document.createElement('span');
      tooltip.className = 'chart__tip';
      tooltip.textContent = day.minutes + ' min';
      bar.appendChild(tooltip);
      track.appendChild(bar);

      var dayLabel = document.createElement('span');
      dayLabel.className = 'chart__day';
      dayLabel.textContent = day.daysAgo === 0 ? 'Today' : weekdayFormatter.format(date);

      var dateLabel = document.createElement('span');
      dateLabel.className = 'chart__date';
      dateLabel.textContent = compactDateFormatter.format(date);

      column.appendChild(track);
      column.appendChild(dayLabel);
      column.appendChild(dateLabel);
      bars.appendChild(column);
    });

    plot.appendChild(grid);
    plot.appendChild(bars);
    chart.appendChild(axis);
    chart.appendChild(plot);

    var accessibleList = $('[data-activity-details]');
    if (accessibleList) {
      accessibleList.innerHTML = '';
      days.forEach(function (day) {
        var item = document.createElement('li');
        item.textContent =
          dateFormatter.format(dateFromDaysAgo(day.daysAgo)) + ': ' + day.minutes + ' minutes';
        accessibleList.appendChild(item);
      });
    }
  }

  function renderGoal(stats) {
    var target = data.weeklyGoal.sessions;
    var progress = clamp((stats.weekSessions / target) * 100, 0, 100);
    var ring = $('[data-goal-ring]');
    var percent = $('[data-goal-percent]');
    var sessions = $('[data-goal-sessions]');
    var message = $('[data-goal-message]');
    var focus = $('[data-goal-focus]');
    var average = $('[data-goal-average]');
    var remaining = Math.max(target - stats.weekSessions, 0);

    if (ring) {
      ring.style.setProperty('--goal-progress', progress);
      ring.setAttribute(
        'aria-label',
        stats.weekSessions + ' of ' + target + ' weekly study sessions completed'
      );
    }

    if (percent) {
      percent.textContent = Math.round(progress) + '%';
    }

    if (sessions) {
      sessions.textContent = stats.weekSessions + ' / ' + target;
    }

    if (message) {
      message.textContent = remaining
        ? remaining === 1
          ? 'One session from a perfect week.'
          : remaining + ' sessions from a perfect week.'
        : 'Weekly goal complete. Beautifully done.';
    }

    if (focus) {
      focus.textContent = formatMinutes(stats.minutesThisWeek);
    }

    if (average) {
      average.textContent = formatMinutes(stats.dailyAverage);
    }
  }

  function createSessionRow(session) {
    var item = document.createElement('li');
    item.className = 'session-row';

    var badge = document.createElement('span');
    badge.className = 'type-badge type-badge--' + typeSlug(session.type);
    badge.setAttribute('aria-hidden', 'true');
    badge.appendChild(createIcon(typeIcons[session.type] || 'book'));

    var main = document.createElement('div');
    main.className = 'session-row__main';

    var title = document.createElement('p');
    title.className = 'session-row__title';
    title.textContent = session.title;

    var meta = document.createElement('p');
    meta.className = 'session-row__meta';

    var subject = document.createElement('span');
    subject.textContent = session.subject;

    var separator = document.createElement('span');
    separator.className = 'meta-sep';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '·';

    var type = document.createElement('span');
    type.textContent = session.type;

    var separatorTwo = separator.cloneNode(true);

    var date = document.createElement('time');
    date.dateTime = session.date;
    date.title = dateFormatter.format(new Date(session.date));
    date.textContent = relativeDay(session.daysAgo);

    meta.appendChild(subject);
    meta.appendChild(separator);
    meta.appendChild(type);
    meta.appendChild(separatorTwo);
    meta.appendChild(date);
    main.appendChild(title);
    main.appendChild(meta);

    var duration = document.createElement('span');
    duration.className = 'session-row__duration';
    var durationLabel = document.createElement('span');
    durationLabel.className = 'sr-only';
    durationLabel.textContent = 'Duration: ';
    duration.appendChild(durationLabel);
    duration.appendChild(document.createTextNode(session.duration + ' min'));

    var outcome = document.createElement('span');
    outcome.className = 'result-pill';

    if (typeof session.score === 'number') {
      outcome.classList.add('result-pill--score');
      outcome.textContent = session.score + '%';
      var scoreLabel = document.createElement('span');
      scoreLabel.className = 'sr-only';
      scoreLabel.textContent = ' quiz score';
      outcome.appendChild(scoreLabel);
    } else if (session.cardsGained) {
      outcome.classList.add('result-pill--cards');
      outcome.textContent = '+' + session.cardsGained + ' cards';
      var cardsLabel = document.createElement('span');
      cardsLabel.className = 'sr-only';
      cardsLabel.textContent = ' mastered';
      outcome.appendChild(cardsLabel);
    } else {
      outcome.classList.add('result-pill--complete');
      outcome.appendChild(createIcon('check', 'icon--small'));
      outcome.appendChild(document.createTextNode('Completed'));
    }

    item.appendChild(badge);
    item.appendChild(main);
    item.appendChild(duration);
    item.appendChild(outcome);

    return item;
  }

  function renderSessionLists() {
    var sorted = data.sessions.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    var recentList = $('[data-recent-sessions]');
    var historyList = $('[data-history-sessions]');
    var recent = sorted.slice(0, 5);

    if (recentList) {
      recentList.innerHTML = '';
      recent.forEach(function (session) {
        recentList.appendChild(createSessionRow(session));
      });
    }

    if (historyList) {
      historyList.innerHTML = '';
      sorted.forEach(function (session) {
        historyList.appendChild(createSessionRow(session));
      });
    }
  }

  function renderHistorySummary(stats) {
    var sessions = $('[data-history-total]');
    var minutes = $('[data-history-minutes]');
    var average = $('[data-history-average]');
    var entries = $('[data-history-entries]');

    if (sessions) {
      sessions.textContent = stats.totalSessions;
    }

    if (minutes) {
      minutes.textContent = formatMinutes(stats.totalMinutes);
    }

    if (average) {
      average.textContent = stats.averageScore + '%';
    }

    if (entries) {
      entries.textContent = stats.totalSessions + ' entries';
    }
  }

  function showToast(message) {
    var toast = $('#toast');
    var toastMessage = $('#toast-message');

    if (!toast || !toastMessage) {
      return;
    }

    toastMessage.textContent = message;
    toast.classList.add('is-visible');

    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 4500);
  }

  function bindActions() {
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-action="create-session"]');

      if (!trigger) {
        return;
      }

      event.preventDefault();

      if (global.MindForgeNavigation) {
        global.MindForgeNavigation.goTo('workspace');
      }

      if (global.MindForgeWorkspace) {
        global.MindForgeWorkspace.focusTopic();
      }

      showToast('The forge is ready — start with a topic and a few notes.');
    });

    var year = $('[data-year]');
    if (year) {
      year.textContent = new Date().getFullYear();
    }
  }

  function init() {
    var stats = computeStats();

    renderStats(stats);
    renderWelcome(stats);
    renderTodayFocus();
    renderActivity(stats);
    renderGoal(stats);
    renderSessionLists();
    renderHistorySummary(stats);
    bindActions();

    document.documentElement.setAttribute('data-ready', 'true');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
