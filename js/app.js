/**
 * MindForge dashboard
 * Renders all workspace data, derives dashboard statistics from the mock
 * fixtures, and wires up the small set of interactions available in Phase 0.
 */
(function (global) {
  'use strict';

  var data = global.MindForgeData;
  var history = global.MindForgeHistory;

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

  function getRecords() {
    return history ? history.all() : [];
  }

  function scoreForRecord(record) {
    var questions = record.quiz.questions;
    var answers =
      record.progress && record.progress.quiz && record.progress.quiz.answers
        ? record.progress.quiz.answers
        : {};
    var answered = 0;
    var correct = 0;

    questions.forEach(function (question) {
      if (!Object.prototype.hasOwnProperty.call(answers, question.id)) {
        return;
      }

      answered += 1;

      if (answers[question.id] === question.answerIndex) {
        correct += 1;
      }
    });

    return {
      answered: answered,
      correct: correct,
      total: questions.length,
      percent: questions.length ? Math.round((correct / questions.length) * 100) : 0,
      complete: answered === questions.length
    };
  }

  function masteryForRecord(record) {
    var known =
      record.progress && record.progress.flashcards && record.progress.flashcards.known
        ? record.progress.flashcards.known
        : [];
    var valid = Object.create(null);

    record.flashcards.forEach(function (card) {
      valid[card.id] = true;
    });

    return {
      known: known.filter(function (id) {
        return valid[id];
      }).length,
      total: record.flashcards.length
    };
  }

  function daysAgoFromDate(value) {
    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return 0;
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return Math.max(0, Math.round((today.getTime() - date.getTime()) / DAY_MS));
  }

  function recordToSession(record) {
    var score = scoreForRecord(record);
    var mastery = masteryForRecord(record);

    return {
      id: record.id,
      title: record.summary.title || record.topic,
      subject: 'Local session',
      type: 'Quiz',
      daysAgo: daysAgoFromDate(record.createdAt),
      date: record.createdAt,
      duration: record.summary.estimatedMinutes || 0,
      cardsGained: mastery.known,
      score: score.answered ? score.percent : null,
      savedRecord: record
    };
  }

  function mergedSessions(records) {
    return data.sessions.concat(records.map(recordToSession));
  }

  function activityWithSaved(records) {
    var byDay = Object.create(null);

    data.activity.forEach(function (day) {
      byDay[day.daysAgo] = day.minutes;
    });

    records.forEach(function (record) {
      var day = daysAgoFromDate(record.createdAt);

      if (day > 13) {
        return;
      }

      byDay[day] = (byDay[day] || 0) + (record.summary.estimatedMinutes || 0);
    });

    return Object.keys(byDay).map(function (day) {
      return {
        daysAgo: Number(day),
        minutes: byDay[day]
      };
    });
  }

  function computeStats(records, activity) {
    var sessions = mergedSessions(records);
    var quizzes = sessions.filter(function (session) {
      return typeof session.score === 'number';
    });
    var scores = quizzes.map(function (quiz) {
      return quiz.score;
    });
    var weekSessions = sessions.filter(function (session) {
      return session.daysAgo <= 6;
    });
    var weekActivity = activity.filter(function (day) {
      return day.daysAgo <= 6;
    });
    var previousActivity = activity.filter(function (day) {
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

    records.forEach(function (record) {
      var mastery = masteryForRecord(record);
      mastered += mastery.known;
      totalCards += mastery.total;
    });

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
    title.textContent = record.summary.title || record.topic;

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
    config.textContent =
      record.config.answerStyleLabel + ' · ' + record.config.difficultyLabel;

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

    if (score.answered) {
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
    openButton.setAttribute('aria-label', 'Open ' + record.summary.title);
    openButton.textContent = 'Open';

    var deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn--quiet btn--sm saved-row__delete';
    deleteButton.type = 'button';
    deleteButton.setAttribute('data-saved-delete', record.id);
    deleteButton.setAttribute(
      'aria-label',
      'Delete ' + record.summary.title + ' from History'
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

  function renderSessionLists(records) {
    var sessions = mergedSessions(records);
    var sorted = sessions.slice().sort(function (a, b) {
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
      data.sessions
        .slice()
        .sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        })
        .forEach(function (session) {
          historyList.appendChild(createSessionRow(session));
        });
    }
  }

  function renderSavedGenerations(records) {
    var list = $('[data-saved-generations]');
    var empty = $('[data-saved-empty]');
    var count = $('[data-saved-count]');

    if (count) {
      count.textContent = records.length + ' saved';
    }

    if (empty) {
      empty.hidden = records.length > 0;
    }

    if (!list) {
      return;
    }

    list.innerHTML = '';
    records.forEach(function (record) {
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
    title.textContent = record.summary.title || record.topic;

    var meta = document.createElement('span');
    meta.textContent =
      relativeDay(daysAgoFromDate(record.createdAt)) +
      ' · ' +
      (score.answered ? score.percent + '% quiz' : 'Quiz not started');

    main.appendChild(title);
    main.appendChild(meta);

    var cards = document.createElement('span');
    cards.className = 'progress-saved-row__cards';
    cards.textContent = mastery.known + ' of ' + mastery.total + ' cards known';

    item.appendChild(main);
    item.appendChild(cards);

    return item;
  }

  function renderProgress(records) {
    var count = records.length;
    var answeredQuizzes = 0;
    var scoreTotal = 0;
    var answeredQuestions = 0;
    var knownCards = 0;
    var totalCards = 0;
    var topics = Object.create(null);
    var quizAverage = null;

    records.forEach(function (record) {
      var score = scoreForRecord(record);
      var mastery = masteryForRecord(record);

      answeredQuestions += score.answered;
      knownCards += mastery.known;
      totalCards += mastery.total;
      topics[record.topic] = true;

      if (score.answered) {
        answeredQuizzes += 1;
        scoreTotal += score.percent;
      }
    });

    if (answeredQuizzes) {
      quizAverage = Math.round(scoreTotal / answeredQuizzes);
    }

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
          answeredQuestions +
          ' answered quiz ' +
          (answeredQuestions === 1 ? 'question' : 'questions') +
          ' and ' +
          knownCards +
          ' known ' +
          (knownCards === 1 ? 'card' : 'cards') +
          ' — a small, honest record of what is sticking.'
        : 'Answer a few quiz questions and mark flashcards as known. This space turns those saved decisions into a picture of what is sticking.';
    }

    var generationsLine = $('[data-progress-line="generations"]');
    if (generationsLine) {
      generationsLine.textContent = count;
    }

    var answeredLine = $('[data-progress-line="answered"]');
    if (answeredLine) {
      answeredLine.textContent = answeredQuestions;
    }

    var cardsLine = $('[data-progress-line="cards"]');
    if (cardsLine) {
      cardsLine.textContent = knownCards + ' / ' + totalCards;
    }

    var average = $('[data-progress="quiz-average"]');
    if (average) {
      average.textContent = quizAverage === null ? '—' : quizAverage + '%';
    }

    var quizNote = $('[data-progress-note="quiz"]');
    if (quizNote) {
      quizNote.textContent = answeredQuizzes
        ? 'From ' +
          answeredQuizzes +
          ' saved quiz ' +
          (answeredQuizzes === 1 ? 'attempt' : 'attempts') +
          '.'
        : 'Take a quiz to start a saved average.';
    }

    var cards = $('[data-progress="cards"]');
    if (cards) {
      cards.textContent = knownCards;
    }

    var cardsNote = $('[data-progress-note="cards"]');
    if (cardsNote) {
      cardsNote.textContent = totalCards
        ? knownCards + ' of ' + totalCards + ' saved cards marked known.'
        : 'No saved cards yet.';
    }

    var topicCount = $('[data-progress="topics"]');
    if (topicCount) {
      topicCount.textContent = Object.keys(topics).length;
    }

    var topicsNote = $('[data-progress-note="topics"]');
    if (topicsNote) {
      topicsNote.textContent = count
        ? 'Across ' + count + ' saved ' + (count === 1 ? 'generation' : 'generations') + '.'
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
        showToast('Reopened “' + record.summary.title + '” from History.');
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
    var outcome = history.remove(id);

    if (!outcome || !outcome.ok) {
      showToast('That saved session could not be deleted. Please try again.');
      return;
    }

    showToast(
      'Removed “' +
        (record ? record.summary.title : 'saved session') +
        '” from History.'
    );
  }

  function bindActions() {
    document.addEventListener('click', function (event) {
      var target = event.target;

      if (!target || typeof target.closest !== 'function') {
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

  function renderAll() {
    var records = getRecords();
    var activity = activityWithSaved(records);
    var stats = computeStats(records, activity);

    renderStats(stats);
    renderWelcome(stats);
    renderTodayFocus(activity);
    renderActivity(stats, activity);
    renderGoal(stats);
    renderSessionLists(records);
    renderHistorySummary(stats);
    renderSavedGenerations(records);
    renderProgress(records);
  }

  function init() {
    bindActions();
    renderAll();

    document.documentElement.setAttribute('data-ready', 'true');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
