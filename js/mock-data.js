/**
 * MindForge mock data
 * Demo-only content for Phase 0. Dates are generated relative to the day the
 * dashboard is opened so recent activity always feels current. Everything the
 * dashboard shows is derived from these fixtures.
 */
(function (global) {
  'use strict';

  function daysAgo(days, hours, minutes) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  }

  var user = {
    name: 'Alex Morgan',
    firstName: 'Alex',
    initials: 'AM',
    plan: 'Scholar plan',
    streak: 12
  };

  var sessions = [
    {
      id: 's-118',
      title: 'The Adaptive Immune System',
      subject: 'Biology',
      type: 'Flashcards',
      daysAgo: 0,
      date: daysAgo(0, 9, 15),
      duration: 68,
      cardsGained: 18,
      score: null
    },
    {
      id: 's-117',
      title: 'Backpropagation & Gradient Descent',
      subject: 'Machine Learning',
      type: 'Quiz',
      daysAgo: 1,
      date: daysAgo(1, 19, 40),
      duration: 82,
      cardsGained: 0,
      score: 92
    },
    {
      id: 's-116',
      title: 'The Gilded Age: Politics & Reform',
      subject: 'History',
      type: 'Reading',
      daysAgo: 2,
      date: daysAgo(2, 16, 10),
      duration: 74,
      cardsGained: 0,
      score: null
    },
    {
      id: 's-115',
      title: 'Organic Chemistry: Reaction Mechanisms',
      subject: 'Chemistry',
      type: 'Flashcards',
      daysAgo: 3,
      date: daysAgo(3, 8, 30),
      duration: 52,
      cardsGained: 14,
      score: null
    },
    {
      id: 's-114',
      title: 'Spanish Subjunctive Mood',
      subject: 'Spanish',
      type: 'Quiz',
      daysAgo: 4,
      date: daysAgo(4, 20, 5),
      duration: 63,
      cardsGained: 0,
      score: 86
    },
    {
      id: 's-113',
      title: 'Linear Algebra: Eigenvalues',
      subject: 'Mathematics',
      type: 'Reading',
      daysAgo: 5,
      date: daysAgo(5, 10, 20),
      duration: 95,
      cardsGained: 0,
      score: null
    },
    {
      id: 's-112',
      title: 'Cell Signaling Pathways',
      subject: 'Biology',
      type: 'Quiz',
      daysAgo: 6,
      date: daysAgo(6, 18, 0),
      duration: 71,
      cardsGained: 0,
      score: 94
    },
    {
      id: 's-111',
      title: 'Macroeconomics: Monetary Policy',
      subject: 'Economics',
      type: 'Reading',
      daysAgo: 7,
      date: daysAgo(7, 11, 45),
      duration: 48,
      cardsGained: 0,
      score: null
    },
    {
      id: 's-110',
      title: 'The Cold War: Containment',
      subject: 'History',
      type: 'Quiz',
      daysAgo: 9,
      date: daysAgo(9, 17, 25),
      duration: 55,
      cardsGained: 0,
      score: 79
    },
    {
      id: 's-109',
      title: 'Convolutional Neural Networks',
      subject: 'Machine Learning',
      type: 'Flashcards',
      daysAgo: 11,
      date: daysAgo(11, 8, 50),
      duration: 62,
      cardsGained: 22,
      score: null
    },
    {
      id: 's-108',
      title: 'Shakespeare: Hamlet, Act III',
      subject: 'Literature',
      type: 'Reading',
      daysAgo: 14,
      date: daysAgo(14, 21, 10),
      duration: 44,
      cardsGained: 0,
      score: null
    },
    {
      id: 's-107',
      title: 'Probability Distributions',
      subject: 'Mathematics',
      type: 'Quiz',
      daysAgo: 18,
      date: daysAgo(18, 14, 30),
      duration: 57,
      cardsGained: 0,
      score: 88
    },
    {
      id: 's-106',
      title: 'Photosynthesis & Light Reactions',
      subject: 'Biology',
      type: 'Reading',
      daysAgo: 22,
      date: daysAgo(22, 9, 5),
      duration: 39,
      cardsGained: 0,
      score: null
    },
    {
      id: 's-105',
      title: 'Spanish Preterite vs. Imperfect',
      subject: 'Spanish',
      type: 'Quiz',
      daysAgo: 27,
      date: daysAgo(27, 19, 20),
      duration: 46,
      cardsGained: 0,
      score: 81
    },
    {
      id: 's-104',
      title: 'Data Structures: Graph Traversal',
      subject: 'Computer Science',
      type: 'Flashcards',
      daysAgo: 33,
      date: daysAgo(33, 13, 15),
      duration: 53,
      cardsGained: 16,
      score: null
    },
    {
      id: 's-103',
      title: 'The French Revolution',
      subject: 'History',
      type: 'Quiz',
      daysAgo: 40,
      date: daysAgo(40, 10, 40),
      duration: 61,
      cardsGained: 0,
      score: 90
    }
  ];

  var decks = [
    { subject: 'Biology', mastered: 128, total: 180 },
    { subject: 'Machine Learning', mastered: 84, total: 140 },
    { subject: 'History', mastered: 61, total: 90 },
    { subject: 'Spanish', mastered: 69, total: 100 }
  ];

  var activity = [
    { daysAgo: 0, minutes: 68 },
    { daysAgo: 1, minutes: 82 },
    { daysAgo: 2, minutes: 74 },
    { daysAgo: 3, minutes: 52 },
    { daysAgo: 4, minutes: 63 },
    { daysAgo: 5, minutes: 95 },
    { daysAgo: 6, minutes: 71 },
    { daysAgo: 7, minutes: 70 },
    { daysAgo: 8, minutes: 85 },
    { daysAgo: 9, minutes: 60 },
    { daysAgo: 10, minutes: 72 },
    { daysAgo: 11, minutes: 48 },
    { daysAgo: 12, minutes: 68 },
    { daysAgo: 13, minutes: 55 }
  ];

  var weeklyGoal = {
    sessions: 8,
    dailyMinutes: 90
  };

  global.MindForgeData = Object.freeze({
    user: user,
    sessions: sessions,
    decks: decks,
    activity: activity,
    weeklyGoal: weeklyGoal
  });
})(window);
