/**
 * MindForge dashboard
 * Renders all workspace data, derives dashboard statistics from the mock
 * fixtures, and wires up the small set of interactions available in Phase 0.
 */
(function (global) {
  'use strict';

  var data = global.MindForgeData;
  var history = global.MindForgeHistory;
  var analytics = global.MindForgeAnalytics;

  if (!data || !analytics) {
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

  function getRecords() {
    return history ? history.all() : [];
  }

  var filterState = {
    query: '',
    difficulty: 'all',
    answerStyle: 'all',
    status: 'all'
  };

  function recordTitle(record) {
    return analytics.recordTitle(record);
  }

  function recordConfig(record) {
    return analytics.configFor(record);
  }

  function recordMinutes(record) {
    return analytics.minutesForRecord(record);
  }

  function scoreForRecord(record) {
    return analytics.scoreRecord(record);
  }

  function masteryForRecord(record) {
    return analytics.masteryForRecord(record);
  }

  function topicForRecord(record) {
    return analytics.topicOf(record);
  }

  function daysAgoFromDate(value) {
    var day = analytics.daysAgoFromDate(value, Date.now());
    return day === null ? 0 : day;
  }

  function recordToSession(record) {
    var score = scoreForRecord(record);
    var mastery = masteryForRecord(record);

    return {
      id: record.id,
      title: recordTitle(record),
      subject: topicForRecord(record),
      type: score.started ? 'Quiz' : 'Flashcards',
      daysAgo: daysAgoFromDate(record.createdAt),
      date: record.createdAt,
      duration: recordMinutes(record),
      cardsGained: mastery.known,
      score: score.started ? score.percent : null,
      savedRecord: record
    };
  }

  function computeStats(records) {
    return analytics.computeStats(records, { now: Date.now() });
  }

  function filteredRecords(records) {
    return analytics.filterRecords(records, filterState);
  }

  function renderStats(stats) {
    var values = {
      sessions: stats.totalSessions,
      quizzes: stats.quizzesCompleted,
      score: stats.averageScore === null ? '—' : stats.averageScore,
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
      sessionsNote.textContent = stats.totalSessions
        ? stats.weekSessions + ' in the last 7 days'
        : 'No sessions saved yet';
    }

    var quizNote = $('[data-stat-note="quizzes"]');
    if (quizNote) {
      quizNote.textContent = stats.quizAttempts
        ? stats.quizzesCompleted +
          ' completed · ' +
          stats.quizAttempts +
          ' started'
        : 'No quiz attempts yet';
    }

    var scoreNote = $('[data-stat-note="score"]');
    if (scoreNote) {
      scoreNote.textContent = stats.quizAttempts
        ? stats.quizzesCompleted
          ? 'Best score ' + stats.topScore + '%'
          : 'Best started score ' + stats.topScore + '%'
        : 'No quiz attempts yet';
    }

    var cardsNote = $('[data-stat-note="cards"]');
    if (cardsNote) {
      cardsNote.textContent = stats.totalCards
        ? stats.masteredCards +
          ' of ' +
          stats.totalCards +
          ' cards known · ' +
          stats.reviewedCards +
          ' reviewed'
        : 'No flashcards yet';
    }

    var meter = $('[data-stat-meter="cards"]');
    if (meter) {
      meter.style.width = clamp(stats.cardProgress, 0, 100) + '%';
      meter.parentElement.setAttribute(
        'aria-label',
        stats.masteredCards + ' of ' + stats.totalCards + ' flashcards known'
      );
    }
  }

  function renderWelcome(stats) {
    var firstName = data.user.firstName;
    var heroName = $('[data-user-first-name]');
    var goal = data.weeklyGoal.sessions;
    var message;

    if (!stats.totalSessions) {
      message =
        'Your archive is empty. Generate your first study session and the dashboard will turn it into an honest record of your learning.';
    } else if (!stats.weekSessions) {
      message =
        'You have ' +
        stats.totalSessions +
        ' saved ' +
        (stats.totalSessions === 1 ? 'session' : 'sessions') +
        ' so far. Nothing yet this week — a short focus block is enough to begin again.';
    } else if (stats.weekSessions >= goal) {
      message =
        'This week you have shaped ' +
        formatMinutes(stats.minutesThisWeek) +
        ' of focus across ' +
        stats.weekSessions +
        ' sessions. Your weekly goal is complete — keep the momentum steady.';
    } else {
      var remaining = goal - stats.weekSessions;
      message =
        'This week you have shaped ' +
        formatMinutes(stats.minutesThisWeek) +
        ' of focus across ' +
        stats.weekSessions +
        ' ' +
        (stats.weekSessions === 1 ? 'session' : 'sessions') +
        '. ' +
        (remaining === 1
          ? 'One more focused session completes your weekly goal.'
          : remaining + ' more focused sessions complete your weekly goal.');
    }

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

    $all('[data-streak-note]').forEach(function (element) {
      element.textContent = stats.streak
        ? 'Consecutive study days'
        : 'Study today to begin';
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
      welcomeMessage.textContent = message;
    }
  }

  function renderTodayFocus(activity) {
    var today = activity.find(function (day) {
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

  function renderActivity(stats, activity) {
    var chart = $('[data-activity-chart]');
    var days = activity
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
      if (!stats.previousMinutes) {
        trendLabel.textContent = stats.minutesThisWeek ? 'New' : '—';
        trendLabel.classList.toggle('trend--up', stats.minutesThisWeek > 0);
        trendLabel.classList.toggle('trend--down', false);
      } else {
        trendLabel.textContent =
          (stats.activityTrend > 0 ? '+' : '') + stats.activityTrend + '%';
        trendLabel.classList.toggle('trend--up', stats.activityTrend > 0);
        trendLabel.classList.toggle('trend--down', stats.activityTrend < 0);
      }
    }

    if (peakLabel) {
      peakLabel.textContent = peak.minutes
        ? weekdayFormatter.format(dateFromDaysAgo(peak.daysAgo)) +
          ' · ' +
          peak.minutes +
          ' min'
        : '—';
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

  function createSavedRow(record) {
    var item = document.createElement('li');
    var score = scoreForRecord(record);
    var mastery = masteryForRecord(record);
    var daysAgo = daysAgoFromDate(record.createdAt);

    item.className = 'saved-row';
    item.setAttribute('data-saved-id', record.id);

    var badge = document.createElement('span');
    badge.className = 'type-badge type-badge--quiz';
    badge.setAttribute('aria-hidden', 'true');
    badge.appendChild(createIcon('spark'));

    var main = document.createElement('div');
    main.className = 'saved-row__main';

    var title = document.createElement('p');
    title.className = 'saved-row__title';
    title.textContent = recordTitle(record);

    var meta = document.createElement('p');
    meta.className = 'saved-row__meta';

    var date = document.createElement('time');
    date.dateTime = record.createdAt;
    date.title = dateFormatter.format(new Date(record.createdAt));
    date.textContent = relativeDay(daysAgo);

    var separator = document.createElement('span');
    separator.className = 'meta-sep';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '·';

    var config = document.createElement('span');
    var labels = recordConfig(record);
    config.textContent =
      labels.answerStyleLabel + ' · ' + labels.difficultyLabel;

    var separatorTwo = separator.cloneNode(true);

    var type = document.createElement('span');
    type.textContent = 'Saved generation';

    meta.appendChild(date);
    meta.appendChild(separator);
    meta.appendChild(config);
    meta.appendChild(separatorTwo);
    meta.appendChild(type);

    main.appendChild(title);
    main.appendChild(meta);

    var metrics = document.createElement('div');
    metrics.className = 'saved-row__metrics';

    var outcome = document.createElement('span');
    outcome.className = 'result-pill';

    if (score.started) {
      outcome.classList.add('result-pill--score');
      outcome.textContent = score.percent + '%';
      var scoreLabel = document.createElement('span');
      scoreLabel.className = 'sr-only';
      scoreLabel.textContent = ' quiz score';
      outcome.appendChild(scoreLabel);
    } else {
      outcome.classList.add('result-pill--complete');
      outcome.textContent = 'Not started';
    }

    var masteryLabel = document.createElement('span');
    masteryLabel.className = 'saved-row__mastery';
    masteryLabel.textContent = mastery.known + ' of ' + mastery.total + ' cards known';

    metrics.appendChild(outcome);
    metrics.appendChild(masteryLabel);

    var actions = document.createElement('div');
    actions.className = 'saved-row__actions';

    var openButton = document.createElement('button');
    openButton.className = 'btn btn--secondary btn--sm';
    openButton.type = 'button';
    openButton.setAttribute('data-saved-open', record.id);
    openButton.setAttribute('aria-label', 'Open ' + recordTitle(record));
    openButton.textContent = 'Open';

    var deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn--quiet btn--sm saved-row__delete';
    deleteButton.type = 'button';
    deleteButton.setAttribute('data-saved-delete', record.id);
    deleteButton.setAttribute(
      'aria-label',
      'Delete ' + recordTitle(record) + ' from History'
    );
    deleteButton.appendChild(createIcon('trash', 'icon--small'));
    var deleteLabel = document.createElement('span');
    deleteLabel.textContent = 'Delete';
    deleteButton.appendChild(deleteLabel);

    actions.appendChild(openButton);
    actions.appendChild(deleteButton);

    item.appendChild(badge);
    item.appendChild(main);
    item.appendChild(metrics);
    item.appendChild(actions);

    return item;
  }

  function emptyListItem(message) {
    var item = document.createElement('li');
    item.className = 'session-row session-row--empty';
    item.textContent = message;
    return item;
  }

  function renderRecentSessions(records) {
    var recentList = $('[data-recent-sessions]');
    var recent = records.slice(0, 5);

    if (!recentList) {
      return;
    }

    recentList.innerHTML = '';

    if (!recent.length) {
      recentList.appendChild(
        emptyListItem(
          'No study sessions yet. Generate one in the Study Workspace and it will appear here.'
        )
      );
      return;
    }

    recent.forEach(function (record) {
      recentList.appendChild(createSessionRow(recordToSession(record)));
    });
  }

  function renderHistoryArchive(records, filtered) {
    var historyList = $('[data-history-sessions]');
    var entries = $('[data-history-entries]');

    if (entries) {
      entries.textContent = records.length
        ? filtered.length === records.length
          ? records.length + ' entries'
          : filtered.length + ' of ' + records.length + ' entries'
        : '0 entries';
    }

    if (!historyList) {
      return;
    }

    historyList.innerHTML = '';

    if (!records.length) {
      historyList.appendChild(emptyListItem('Your saved study sessions will appear here.'));
      return;
    }

    if (!filtered.length) {
      historyList.appendChild(emptyListItem('No sessions match the current search or filters.'));
      return;
    }

    filtered.forEach(function (record) {
      historyList.appendChild(createSessionRow(recordToSession(record)));
    });
  }

  function renderSavedGenerations(records, filtered) {
    var list = $('[data-saved-generations]');
    var empty = $('[data-saved-empty]');
    var noResults = $('[data-saved-no-results]');
    var count = $('[data-saved-count]');
    var total = records.length;
    var visible = filtered.length;

    if (count) {
      count.textContent = total
        ? visible === total
          ? total + ' saved'
          : visible + ' of ' + total + ' saved'
        : '0 saved';
    }

    if (empty) {
      empty.hidden = total > 0;
    }

    if (noResults) {
      noResults.hidden = !(total > 0 && visible === 0);
    }

    if (!list) {
      return;
    }

    list.innerHTML = '';
    filtered.forEach(function (record) {
      list.appendChild(createSavedRow(record));
    });
  }

  function createProgressRow(record) {
    var score = scoreForRecord(record);
    var mastery = masteryForRecord(record);
    var item = document.createElement('li');
    item.className = 'progress-saved-row';

    var main = document.createElement('div');
    main.className = 'progress-saved-row__main';

    var title = document.createElement('strong');
    title.textContent = recordTitle(record);

    var meta = document.createElement('span');
    meta.textContent =
      relativeDay(daysAgoFromDate(record.createdAt)) +
      ' · ' +
      (score.started
        ? score.percent + '% quiz · ' + score.correct + ' of ' + score.total + ' correct'
        : 'Quiz not started');

    main.appendChild(title);
    main.appendChild(meta);

    var cards = document.createElement('span');
    cards.className = 'progress-saved-row__cards';
    cards.textContent =
      mastery.known +
      ' of ' +
      mastery.total +
      ' known · ' +
      mastery.reviewed +
      ' reviewed';

    item.appendChild(main);
    item.appendChild(cards);

    return item;
  }

  function renderProgress(records, stats) {
    var count = records.length;

    var status = $('[data-progress-status]');
    if (status) {
      status.textContent = count ? 'Live from saved data' : 'No saved data yet';
    }

    var summary = $('[data-progress-summary]');
    if (summary) {
      summary.textContent = count
        ? 'You have saved ' +
          count +
          (count === 1 ? ' generation' : ' generations') +
          '. Those decisions have produced ' +
          stats.answeredQuestions +
          ' answered quiz ' +
          (stats.answeredQuestions === 1 ? 'question' : 'questions') +
          ', ' +
          stats.masteredCards +
          ' known ' +
          (stats.masteredCards === 1 ? 'card' : 'cards') +
          ' and ' +
          stats.reviewedCards +
          ' reviewed ' +
          (stats.reviewedCards === 1 ? 'card' : 'cards') +
          ' — a small, honest record of what is sticking.'
        : 'Answer a few quiz questions and mark flashcards as known or not known. This space turns those saved decisions into a picture of what is sticking.';
    }

    var generationsLine = $('[data-progress-line="generations"]');
    if (generationsLine) {
      generationsLine.textContent = count;
    }

    var answeredLine = $('[data-progress-line="answered"]');
    if (answeredLine) {
      answeredLine.textContent = stats.answeredQuestions;
    }

    var cardsLine = $('[data-progress-line="cards"]');
    if (cardsLine) {
      cardsLine.textContent = stats.masteredCards + ' / ' + stats.totalCards;
    }

    var average = $('[data-progress="quiz-average"]');
    if (average) {
      average.textContent =
        stats.averageScore === null ? '—' : stats.averageScore + '%';
    }

    var quizNote = $('[data-progress-note="quiz"]');
    if (quizNote) {
      quizNote.textContent = stats.quizAttempts
        ? 'From ' +
          stats.quizAttempts +
          ' saved quiz ' +
          (stats.quizAttempts === 1 ? 'attempt' : 'attempts') +
          ' (' +
          stats.quizzesCompleted +
          ' completed).'
        : 'Take a quiz to start a saved average.';
    }

    var cards = $('[data-progress="cards"]');
    if (cards) {
      cards.textContent = stats.masteredCards;
    }

    var cardsNote = $('[data-progress-note="cards"]');
    if (cardsNote) {
      cardsNote.textContent = stats.totalCards
        ? stats.masteredCards +
          ' of ' +
          stats.totalCards +
          ' saved cards known · ' +
          stats.reviewedCards +
          ' reviewed at least once.'
        : 'No saved cards yet.';
    }

    var topicCount = $('[data-progress="topics"]');
    if (topicCount) {
      topicCount.textContent = stats.topicCount;
    }

    var topicsNote = $('[data-progress-note="topics"]');
    if (topicsNote) {
      topicsNote.textContent = count
        ? 'Across ' +
          count +
          ' saved ' +
          (count === 1 ? 'generation' : 'generations') +
          '.'
        : 'Your saved topics will collect here.';
    }

    var progressCount = $('[data-progress-count]');
    if (progressCount) {
      progressCount.textContent = count + ' saved';
    }

    var empty = $('[data-progress-empty]');
    if (empty) {
      empty.hidden = count > 0;
    }

    var list = $('[data-progress-sessions]');
    if (!list) {
      return;
    }

    list.innerHTML = '';
    records.forEach(function (record) {
      list.appendChild(createProgressRow(record));
    });
  }

  function renderHistorySummary(stats, records) {
    var sessions = $('[data-history-total]');
    var minutes = $('[data-history-minutes]');
    var average = $('[data-history-average]');

    if (sessions) {
      sessions.textContent = stats.totalSessions;
    }

    if (minutes) {
      minutes.textContent = formatMinutes(stats.totalMinutes);
    }

    if (average) {
      average.textContent =
        stats.averageScore === null || !records.length
          ? '—'
          : stats.averageScore + '%';
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

  function openSavedGeneration(id) {
    var record = history ? history.get(id) : null;

    if (!record) {
      showToast('That saved session is no longer available.');
      renderAll();
      return;
    }

    if (global.MindForgeNavigation) {
      global.MindForgeNavigation.goTo('workspace');
    }

    if (global.MindForgeWorkspace && global.MindForgeWorkspace.openSaved) {
      if (global.MindForgeWorkspace.openSaved(record)) {
        showToast('Reopened “' + recordTitle(record) + '” from History.');
      }
    } else {
      showToast('The Study Workspace is not available right now.');
    }
  }

  function deleteSavedGeneration(id) {
    if (!history) {
      showToast('History is not available in this browser.');
      return;
    }

    var record = history.get(id);

    if (!record) {
      showToast('That saved session is no longer available.');
      renderAll();
      return;
    }

    var label = recordTitle(record);

    if (
      typeof global.confirm === 'function' &&
      !global.confirm(
        'Delete “' + label + '” from History? This cannot be undone.'
      )
    ) {
      return;
    }

    var outcome = history.remove(id);

    if (!outcome || !outcome.ok) {
      showToast(
        (outcome && outcome.message) ||
          'That saved session could not be deleted. Please try again.'
      );
      return;
    }

    showToast('Removed “' + label + '” from History.');
  }

  function syncFilters() {
    var search = $('[data-history-search]');

    if (search) {
      filterState.query = search.value || '';
    }

    $all('[data-history-filter]').forEach(function (control) {
      var key = control.getAttribute('data-history-filter');

      if (key) {
        filterState[key] = control.value || 'all';
      }
    });
  }

  function resetFilters() {
    var search = $('[data-history-search]');

    if (search) {
      search.value = '';
    }

    $all('[data-history-filter]').forEach(function (control) {
      control.value = 'all';
    });

    syncFilters();
    renderAll();

    if (search) {
      try {
        search.focus({ preventScroll: true });
      } catch (error) {
        search.focus();
      }
    }
  }

  function bindFilters() {
    var search = $('[data-history-search]');

    if (search) {
      search.addEventListener('input', function () {
        syncFilters();
        renderAll();
      });
    }

    $all('[data-history-filter]').forEach(function (control) {
      control.addEventListener('change', function () {
        syncFilters();
        renderAll();
      });
    });
  }

  function bindActions() {
    document.addEventListener('click', function (event) {
      var target = event.target;

      if (!target || typeof target.closest !== 'function') {
        return;
      }

      var resetTrigger = target.closest('[data-history-reset]');

      if (resetTrigger) {
        event.preventDefault();
        resetFilters();
        return;
      }

      var createTrigger = target.closest('[data-action="create-session"]');

      if (createTrigger) {
        event.preventDefault();

        if (global.MindForgeNavigation) {
          global.MindForgeNavigation.goTo('workspace');
        }

        if (global.MindForgeWorkspace) {
          global.MindForgeWorkspace.focusTopic();
        }

        showToast('The forge is ready — start with a topic and a few notes.');
        return;
      }

      var openTrigger = target.closest('[data-saved-open]');

      if (openTrigger) {
        event.preventDefault();
        openSavedGeneration(openTrigger.getAttribute('data-saved-open'));
        return;
      }

      var deleteTrigger = target.closest('[data-saved-delete]');

      if (deleteTrigger) {
        event.preventDefault();
        deleteSavedGeneration(deleteTrigger.getAttribute('data-saved-delete'));
      }
    });

    document.addEventListener('mindforge:notice', function (event) {
      if (event.detail && event.detail.message) {
        showToast(event.detail.message);
      }
    });

    document.addEventListener('mindforge:historychange', function () {
      renderAll();
    });

    var year = $('[data-year]');
    if (year) {
      year.textContent = new Date().getFullYear();
    }
  }

  function surfaceStorageIssues() {
    if (!history || typeof history.getIssues !== 'function') {
      return;
    }

    var issues = history.getIssues();
    var important = issues.filter(function (issue) {
      return (
        issue.code === 'corrupt-history' ||
        issue.code === 'corrupt-notes' ||
        issue.code === 'unsupported-version' ||
        issue.code === 'invalid-record' ||
        issue.code === 'migration-failed' ||
        issue.code === 'write-failed'
      );
    });

    if (!important.length) {
      return;
    }

    showToast(important[important.length - 1].message);
  }

  function renderAll() {
    var records = getRecords();
    var stats = computeStats(records);
    var visible = filteredRecords(records);

    renderStats(stats);
    renderWelcome(stats);
    renderTodayFocus(stats.activity);
    renderActivity(stats, stats.activity);
    renderGoal(stats);
    renderRecentSessions(records);
    renderHistorySummary(stats, records);
    renderHistoryArchive(records, visible);
    renderSavedGenerations(records, visible);
    renderProgress(records, stats);
  }

  function init() {
    bindActions();
    bindFilters();
    syncFilters();
    renderAll();
    surfaceStorageIssues();

    document.documentElement.setAttribute('data-ready', 'true');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
