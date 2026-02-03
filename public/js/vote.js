import { db, doc, onSnapshot, updateDoc, increment, getDocs, collection } from './app.js';

// DOM Elements
const lobbyState = document.getElementById('lobby-state');
const questionState = document.getElementById('question-state');
const votedState = document.getElementById('voted-state');
const resultsState = document.getElementById('results-state');
const databaseViewState = document.getElementById('database-view-state');
const votePollTitle = document.getElementById('vote-poll-title');
const lobbyMessage = document.getElementById('lobby-message');
const questionTitle = document.getElementById('question-title-vote');
const optionsGrid = document.getElementById('options-grid');
const resultsQuestionTitle = document.getElementById('results-question-title-vote');
const voteResultsChartCanvas = document.getElementById('vote-results-chart');
const votedInfoEl = document.getElementById('voted-info');
const showVotesBtn = document.getElementById('show-votes-btn');
const viewDatabaseBtn = document.getElementById('view-database-btn');
const backToResultsBtn = document.getElementById('back-to-results-btn');
const databaseContent = document.getElementById('database-content');

// State Variables & Setup
let currentUserId = null;
let currentPollId = null;
let currentQuestionId = null;
let unsubscribePoll = null; 
let unsubscribeQuestion = null;
let unsubscribeResults = null; // Listener for results
let currentChart = null;
let currentQuestionData = null;
let currentVoteCounts = null;

if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Event Listeners for Interactive Features
if (showVotesBtn) {
    showVotesBtn.addEventListener('click', () => {
        showState('database-view');
        loadDatabaseRecords();
    });
}

if (viewDatabaseBtn) {
    viewDatabaseBtn.addEventListener('click', () => {
        showState('database-view');
        loadDatabaseRecords();
    });
}

if (backToResultsBtn) {
    backToResultsBtn.addEventListener('click', () => {
        showState('results');
    });
}

// --- UTILITY FUNCTIONS ---
function showState(state, message) {
    [lobbyState, questionState, votedState, resultsState, databaseViewState].forEach(el => el && el.classList.add('hidden'));
    
    const targetState = document.getElementById(`${state}-state`);
    if (targetState) {
        targetState.classList.remove('hidden');
    } else if (state === 'error' && lobbyState) {
        lobbyState.classList.remove('hidden');
        if (votePollTitle) votePollTitle.textContent = 'Error';
        if (lobbyMessage) lobbyMessage.textContent = message || 'An error occurred.';
        if (unsubscribePoll) unsubscribePoll();
        if (unsubscribeQuestion) unsubscribeQuestion();
        if (unsubscribeResults) unsubscribeResults();
    }
}

// --- CORE LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    currentUserId = params.get('user');
    currentPollId = params.get('poll');
    
    if (!currentPollId || !currentUserId) {
        return showState('error', "Invalid join link. Please get a new one from the host.");
    }
    
    showState('lobby');
    listenToPoll(currentUserId, currentPollId);
});

function listenToPoll(userId, pollId) {
    if (unsubscribePoll) unsubscribePoll(); 

    const pollRef = doc(db, 'users', userId, 'polls', pollId);
    unsubscribePoll = onSnapshot(pollRef, (pollDoc) => {
        if (!pollDoc.exists()) {
            return showState('error', "This poll is no longer available.");
        }
        
        const pollData = pollDoc.data();
        if (votePollTitle) votePollTitle.textContent = `Joining "${pollData.title}"...`;
        
        const newQuestionId = pollData.currentQuestionId;
        if (newQuestionId && newQuestionId !== currentQuestionId) {
            currentQuestionId = newQuestionId;
            listenToQuestion(userId, pollId, currentQuestionId);
        } else if (!newQuestionId) {
            if (unsubscribeQuestion) unsubscribeQuestion();
            if (unsubscribeResults) unsubscribeResults();
            currentQuestionId = null;
            showState('lobby');
        }
    }, (error) => {
        console.error("Poll Listener error:", error);
        showState('error', "Lost connection to the poll.");
    });
}

function listenToQuestion(userId, pollId, questionId) {
    if (unsubscribeQuestion) unsubscribeQuestion();
    if (unsubscribeResults) unsubscribeResults();

    const questionRef = doc(db, 'users', userId, 'polls', pollId, 'questions', questionId);
    unsubscribeQuestion = onSnapshot(questionRef, (qDoc) => {
        if (!qDoc.exists()) return; 

        const questionData = qDoc.data();
        currentQuestionData = questionData; // Store question data
        if (questionData.status === 'results_revealed') {
            const resultsRef = doc(questionRef, 'results', 'vote_counts');
            unsubscribeResults = onSnapshot(resultsRef, (resultsDoc) => {
                if (resultsDoc.exists()){
                     const voteCounts = resultsDoc.data().counts;
                     currentVoteCounts = voteCounts; // Store vote counts
                     renderResultsChart(questionData, voteCounts);
                     showState('results');
                }
            });
        } else if (sessionStorage.getItem(`voted_${questionId}`)) {
            showState('voted');
            if (votedInfoEl) {
                votedInfoEl.textContent = 'Your vote has been recorded! View the results above.';
            }
            if (showVotesBtn) {
                showVotesBtn.style.display = 'inline-block';
            }
        } else {
            renderQuestion(questionData);
            showState('question');
        }
    });
}

function renderQuestion(data) {
    if (questionTitle) questionTitle.textContent = data.questionText;
    if (optionsGrid) optionsGrid.innerHTML = ''; 
    
    data.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = option.text;
        button.style.backgroundColor = option.color;
        button.style.animation = `slideIn 0.5s ease-out ${index * 0.1}s both`;
        button.addEventListener('click', () => handleVote(option.id, button), { once: true });
        if(optionsGrid) optionsGrid.appendChild(button);
    });
}

// *** CORRECTED FUNCTION ***
// Directly updates the 'vote_counts' document. Much simpler and more efficient.
async function handleVote(optionId, button) {
    sessionStorage.setItem(`voted_${currentQuestionId}`, 'true');
    
    // Add visual feedback
    if (button) {
        button.style.transform = 'scale(0.95)';
        button.style.opacity = '0.5';
        button.disabled = true;
    }
    
    if (navigator.vibrate) navigator.vibrate(100);
    
    // Show voted state with animation
    showState('voted');
    
    try {
        const resultsDocRef = doc(db, 'users', currentUserId, 'polls', currentPollId, 'questions', currentQuestionId, 'results', 'vote_counts');

        // Use dot notation to increment a field within the 'counts' map.
        await updateDoc(resultsDocRef, {
            [`counts.${optionId}`]: increment(1)
        });
        
        // Update the voted info message
        if (votedInfoEl) {
            votedInfoEl.innerHTML = `<strong>✓ Vote recorded!</strong><br>Vote count updated in the database.`;
        }
        if (showVotesBtn) {
            showVotesBtn.style.display = 'inline-block';
        }

    } catch (error) {
        console.error("Error submitting vote:", error);
        sessionStorage.removeItem(`voted_${currentQuestionId}`);
        if (button) {
            button.style.transform = 'scale(1)';
            button.style.opacity = '1';
            button.disabled = false;
        }
        showState('question');
        alert("Your vote could not be counted. Please try again.");
    }
}

// No changes needed below this line
function renderResultsChart(data, voteCounts) {
    if (resultsQuestionTitle) resultsQuestionTitle.textContent = data.questionText;
    
    const labels = data.options.map(opt => opt.text);
    const colors = data.options.map(opt => opt.color);
    const votes = data.options.map(opt => voteCounts[opt.id] || 0);
    const totalVotes = votes.reduce((a, b) => a + b, 0);

    const legendContainer = document.createElement('div');
    legendContainer.className = 'vote-results-legend';
    data.options.forEach(opt => {
        const voteCount = voteCounts[opt.id] || 0;
        const percentage = totalVotes > 0 ? (voteCount / totalVotes * 100).toFixed(0) : 0;
        legendContainer.innerHTML += `
            <div class="legend-item">
                <span class="legend-color-box" style="background-color: ${opt.color};"></span>
                <span class="legend-text">${opt.text} <strong>(${percentage}%)</strong></span>
            </div>
        `;
    });
    const resultsCard = resultsState.querySelector('.card');
    const existingLegend = resultsCard.querySelector('.vote-results-legend');
    if (existingLegend) existingLegend.remove();
    resultsCard.insertBefore(legendContainer, resultsCard.querySelector('p'));


    if (currentChart) currentChart.destroy();
    if (!voteResultsChartCanvas) return;

    const ctx = voteResultsChartCanvas.getContext('2d');
    currentChart = new Chart(ctx, {
        type: data.chartType || 'bar',
        data: {
            labels,
            datasets: [{ data: votes, backgroundColor: colors, borderWidth: 0 }]
        },
        options: {
             indexAxis: data.chartType === 'bar' ? 'y' : 'x',
             responsive: true,
             maintainAspectRatio: false,
             plugins: { 
                legend: { display: false },
                datalabels: {
                    display: true,
                    color: '#fff',
                    anchor: 'center',
                    align: 'center',
                    font: { size: 16, weight: 'bold' },
                    formatter: (value) => {
                        if (value === 0) return null;
                        if (data.resultsDisplay === 'number') return value;
                        if (totalVotes === 0) return '0%';
                        return `${(value / totalVotes * 100).toFixed(0)}%`;
                    }
                }
             },
             scales: data.chartType === 'bar' ? { 
                 y: { display: false },
                 x: { ticks: { display: false }, grid: { display: false } }
             } : {}
        }
    });
}

// --- DATABASE VIEW FUNCTIONS ---
async function loadDatabaseRecords() {
    if (databaseContent) {
        databaseContent.innerHTML = '<p style="text-align: center;">Loading database records...</p>';
    }

    try {
        // Get the vote counts from Firestore
        const resultsDocRef = doc(db, 'users', currentUserId, 'polls', currentPollId, 'questions', currentQuestionId, 'results', 'vote_counts');
        const resultsSnapshot = await getDocs(collection(resultsDocRef.parent, 'vote_counts'));
        
        // Fetch the actual vote_counts document
        const voteCountsRef = doc(db, 'users', currentUserId, 'polls', currentPollId, 'questions', currentQuestionId, 'results', 'vote_counts');
        const voteCountsSnapshot = await getDocs(voteCountsRef.parent);
        
        let htmlContent = '<table style="width: 100%; border-collapse: collapse;">';
        htmlContent += '<thead><tr style="border-bottom: 2px solid #ddd;"><th style="padding: 10px; text-align: left;">Option</th><th style="padding: 10px; text-align: center;">Votes</th><th style="padding: 10px; text-align: center;">Percentage</th></tr></thead><tbody>';
        
        if (currentQuestionData && currentVoteCounts) {
            const totalVotes = Object.values(currentVoteCounts).reduce((a, b) => a + b, 0);
            
            currentQuestionData.options.forEach(option => {
                const voteCount = currentVoteCounts[option.id] || 0;
                const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(1) : 0;
                const colorBox = `<span style="display: inline-block; width: 12px; height: 12px; background-color: ${option.color}; border-radius: 2px; margin-right: 8px;"></span>`;
                
                htmlContent += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px;">${colorBox} ${option.text}</td>
                    <td style="padding: 12px; text-align: center;"><strong>${voteCount}</strong></td>
                    <td style="padding: 12px; text-align: center;">${percentage}%</td>
                </tr>`;
            });
            
            const totalVotesDisplay = Object.values(currentVoteCounts).reduce((a, b) => a + b, 0);
            htmlContent += `<tr style="background-color: #f5f5f5; font-weight: bold; border-top: 2px solid #ddd;">
                <td style="padding: 12px;">Total Votes</td>
                <td style="padding: 12px; text-align: center;">${totalVotesDisplay}</td>
                <td style="padding: 12px; text-align: center;">100%</td>
            </tr>`;
        }
        
        htmlContent += '</tbody></table>';
        
        if (databaseContent) {
            databaseContent.innerHTML = htmlContent;
        }
        
    } catch (error) {
        console.error("Error loading database records:", error);
        if (databaseContent) {
            databaseContent.innerHTML = '<p style="color: red;">Error loading database records. Please try again.</p>';
        }
    }
}