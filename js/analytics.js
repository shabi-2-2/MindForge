/**
 * MindForge learning analytics
 * Pure, DOM-free calculations over saved generation records. The dashboard,
 * History and Progress views all read from this module so the same session is
 * counted once and partial or missing progress cannot crash the UI.
 */
(function (global) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var ACTIVITY_DAYS = 14;

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function recordTitle(record) {
    if (!isObject(record)) {
      return 'Study session';
    }

    if (
      isObject(record.summary) &&
      typeof record.summary.title === 'string' &&
      record.summary.title.trim()
    ) {
      return record.summary.title.trim();
    }

    if (typeof record.topic === 'string' && record.topic.trim()) {
      return record.topic.trim();
    }

    var text = isObject(record.summary) ? record.summary.text : '';

    if (typeof text === 'string' && text.trim()) {
      return text.trim().slice(0, 60) + (text.length > 60 ? '…' : '');
    }

    return 'Study session';
  }

  function topicOf(record) {
    if (isObject(record) && typeof record.topic === 'string' && record.topic.trim()) {
      return record.topic.trim();
    }

    return recordTitle(record);
  }

  function configFor(record) {
    var config = isObject(record) && isObject(record.config) ? record.config : {};

    return {
      answerStyle:
        typeof config.answerStyle === 'string' ? config.answerStyle : '',
      answerStyleLabel:
        typeof config.answerStyleLabel === 'string' && config.answerStyleLabel
          ? config.answerStyleLabel
          : 'Study material',
      difficulty:
        typeof config.difficulty === 'string' ? config.difficulty : '',
      difficultyLabel:
        typeof config.difficultyLabel === 'string' && config.difficultyLabel
          ? config.difficultyLabel
          : 'Medium'
    };
  }

  function minutesForRecord(record) {
    return isObject(record) &&
      isObject(record.summary) &&
      isFiniteNumber(record.summary.estimatedMinutes) &&
      record.summary.estimatedMinutes > 0
      ? Math.round(record.summary.estimatedMinutes)
      : 0;
  }

  function scoreRecord(record) {
    var questions =
      isObject(record) && Array.isArray(record.quiz) ? record.quiz : [];
    var answers =
      isObject(record) &&
      isObject(record.progress) &&
      isObject(record.progress.quiz) &&
      isObject(record.progress.quiz.answers)
        ? record.progress.quiz.answers
        : {};
    var answered = 0;
    var correct = 0;
    var seen = Object.create(null);

    questions.forEach(function (question) {
      if (
        !isObject(question) ||
        typeof question.id !== 'string' ||
        seen[question.id] ||
        !Object.prototype.hasOwnProperty.call(answers, question.id)
      ) {
        return;
      }

      var selected = answers[question.id];

      if (
        !isFiniteNumber(selected) ||
        Math.floor(selected) !== selected ||
        selected < 0 ||
        selected >= (Array.isArray(question.options) ? question.options.length : 0)
      ) {
        return;
      }

      seen[question.id] = true;
      answered += 1;

      if (selected === question.correctAnswer) {
        correct += 1;
      }
    });

    return {
      answered: answered,
      correct: correct,
      total: questions.length,
      percent: questions.length
        ? Math.round((correct / questions.length) * 100)
        : 0,
      started: answered > 0,
      complete: questions.length > 0 && answered === questions.length
    };
  }

  function uniqueValidIds(ids, valid) {
    var seen = Object.create(null);
    var values = [];

    if (!Array.isArray(ids)) {
      return values;
    }

    ids.forEach(function (id) {
      if (typeof id === 'string' && valid[id] && !seen[id]) {
        seen[id] = true;
        values.push(id);
      }
    });

    return values;
  }

  function masteryForRecord(record) {
    var cards =
      isObject(record) && Array.isArray(record.flashcards)
        ? record.flashcards
        : [];
    var progress =
      isObject(record) && isObject(record.progress) ? record.progress : {};
    var cardProgress = isObject(progress.flashcards) ? progress.flashcards : {};
    var valid = Object.create(null);
    var reviewed = Object.create(null);

    cards.forEach(function (card) {
      if (isObject(card) && typeof card.id === 'string') {
        valid[card.id] = true;
      }
    });

    var known = uniqueValidIds(cardProgress.known, valid);
    var explicitlyReviewed = uniqueValidIds(cardProgress.reviewed, valid);

    known.forEach(function (id) {
      reviewed[id] = true;
    });
    explicitlyReviewed.forEach(function (id) {
      reviewed[id] = true;
    });

    return {
      known: known.length,
      reviewed: Object.keys(reviewed).length,
      total: cards.length,
      knownIds: known
    };
  }

  function daysAgoFromDate(value, now) {
    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return null;
    }

    var today = new Date(now || Date.now());
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return Math.max(0, Math.round((today.getTime() - date.getTime()) / DAY_MS));
  }

  function activityForRecords(records, options) {
    var settings = options || {};
    var days = Math.max(1, settings.days || ACTIVITY_DAYS);
    var now = settings.now === undefined ? Date.now() : settings.now;
    var byDay = Object.create(null);

    for (var index = 0; index < days; index += 1) {
      byDay[index] = 0;
    }

    (Array.isArray(records) ? records : []).forEach(function (record) {
      var day = daysAgoFromDate(record.createdAt, now);

      if (day === null || day >= days) {
        return;
      }

      byDay[day] += minutesForRecord(record);
    });

    return Object.keys(byDay)
      .map(function (day) {
        return {
          daysAgo: Number(day),
          minutes: byDay[day]
        };
      })
      .sort(function (a, b) {
        return a.daysAgo - b.daysAgo;
      });
  }

  function dayKey(date) {
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    );
  }

  function streakForRecords(records, now) {
    var days = Object.create(null);
    var source = Array.isArray(records) ? records : [];

    source.forEach(function (record) {
      var date = new Date(record.createdAt);

      if (!isNaN(date.getTime())) {
        days[dayKey(date)] = true;
      }
    });

    var cursor = new Date(now === undefined ? Date.now() : now);
    cursor.setHours(12, 0, 0, 0);

    if (!days[dayKey(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
    }

    var streak = 0;

    while (days[dayKey(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  function computeStats(records, options) {
    var settings = options || {};
    var source = Array.isArray(records)
      ? records.filter(function (record) {
          return isObject(record);
        })
      : [];
    var activity = activityForRecords(source, {
      days: ACTIVITY_DAYS,
      now: settings.now
    });
    var started = [];
    var completed = [];
    var masteredCards = 0;
    var reviewedCards = 0;
    var totalCards = 0;
    var answeredQuestions = 0;
    var topics = Object.create(null);

    source.forEach(function (record) {
      var score = scoreRecord(record);
      var mastery = masteryForRecord(record);

      if (score.started) {
        started.push(score);
      }

      if (score.complete) {
        completed.push(score);
      }

      answeredQuestions += score.answered;
      masteredCards += mastery.known;
      reviewedCards += mastery.reviewed;
      totalCards += mastery.total;
      topics[topicOf(record)] = true;
    });

    var scores = started.map(function (score) {
      return score.percent;
    });
    var completeScores = completed.map(function (score) {
      return score.percent;
    });
    var weekActivity = activity.filter(function (day) {
      return day.daysAgo <= 6;
    });
    var previousActivity = activity.filter(function (day) {
      return day.daysAgo >= 7 && day.daysAgo <= 13;
    });
    var minutesThisWeek = weekActivity.reduce(function (total, day) {
      return total + day.minutes;
    }, 0);
    var previousMinutes = previousActivity.reduce(function (total, day) {
      return total + day.minutes;
    }, 0);
    var weekSessions = source.filter(function (record) {
      var day = daysAgoFromDate(record.createdAt, settings.now);

      return day !== null && day <= 6;
    }).length;

    return {
      totalSessions: source.length,
      totalMinutes: source.reduce(function (total, record) {
        return total + minutesForRecord(record);
      }, 0),
      quizAttempts: started.length,
      quizzesCompleted: completed.length,
      answeredQuestions: answeredQuestions,
      averageScore: scores.length
        ? Math.round(
            scores.reduce(function (total, score) {
              return total + score;
            }, 0) / scores.length
          )
        : null,
      completedAverage: completeScores.length
        ? Math.round(
            completeScores.reduce(function (total, score) {
              return total + score;
            }, 0) / completeScores.length
          )
        : null,
      topScore: scores.length ? Math.max.apply(null, scores) : 0,
      topicCount: Object.keys(topics).length,
      masteredCards: masteredCards,
      reviewedCards: reviewedCards,
      totalCards: totalCards,
      cardProgress: totalCards
        ? Math.round((masteredCards / totalCards) * 100)
        : 0,
      weekSessions: weekSessions,
      minutesThisWeek: minutesThisWeek,
      previousMinutes: previousMinutes,
      activityTrend: previousMinutes
        ? Math.round(((minutesThisWeek - previousMinutes) / previousMinutes) * 100)
        : 0,
      dailyAverage: Math.round(minutesThisWeek / 7),
      streak: streakForRecords(source, settings.now),
      activity: activity
    };
  }

  function recordTime(record) {
    var value = record && (record.createdAt || record.savedAt || record.updatedAt);
    var time = new Date(value).getTime();

    return isNaN(time) ? 0 : time;
  }

  function filterRecords(records, filters) {
    var settings = filters || {};
    var query =
      typeof settings.query === 'string'
        ? settings.query.trim().toLowerCase()
        : '';
    var difficulty = settings.difficulty || 'all';
    var status = settings.status || 'all';
    var answerStyle = settings.answerStyle || 'all';

    return (Array.isArray(records) ? records : [])
      .filter(function (record) {
        if (!isObject(record)) {
          return false;
        }

        var config = configFor(record);
        var searchable = [
          topicOf(record),
          recordTitle(record),
          config.answerStyleLabel,
          config.difficultyLabel
        ]
          .join(' ')
          .toLowerCase();

        if (query && searchable.indexOf(query) === -1) {
          return false;
        }

        if (difficulty !== 'all' && config.difficulty !== difficulty) {
          return false;
        }

        if (answerStyle !== 'all' && config.answerStyle !== answerStyle) {
          return false;
        }

        if (status !== 'all') {
          var score = scoreRecord(record);

          if (status === 'completed' && !score.complete) {
            return false;
          }

          if (
            status === 'in-progress' &&
            (!score.started || score.complete)
          ) {
            return false;
          }

          if (status === 'not-started' && score.started) {
            return false;
          }

          if (status === 'known' && masteryForRecord(record).known === 0) {
            return false;
          }
        }

        return true;
      })
      .sort(function (left, right) {
        return recordTime(right) - recordTime(left);
      });
  }

  global.MindForgeAnalytics = Object.freeze({
    ACTIVITY_DAYS: ACTIVITY_DAYS,
    recordTitle: recordTitle,
    topicOf: topicOf,
    configFor: configFor,
    minutesForRecord: minutesForRecord,
    scoreRecord: scoreRecord,
    masteryForRecord: masteryForRecord,
    daysAgoFromDate: daysAgoFromDate,
    activityForRecords: activityForRecords,
    streakForRecords: streakForRecords,
    computeStats: computeStats,
    filterRecords: filterRecords
  });
})(window);
