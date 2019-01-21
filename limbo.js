var limbo = {};

(function(l){
  const BASE_URL = 'https://www.googleapis.com/youtube/v3/search';
  const API_KEY = 'AIzaSyB7izYG7ZnNcqP_P1BS7NUeRwsxeGpJY2U';

  const THEATER_ENTER = 'Enter theater mode';
  const THEATER_EXIT = 'Exit theater mode';
  const THEATER_MODE_CLASS = 'theater-mode';

  const MAX_RESULTS = 5;

  l.searchedVideos = [];
  l.searchMetaData = {};
  l.isInTheaterMode = false;

  var searchBox;
  var searchBtn;
  var searchResults;
  var publishedAfter;
  var publishedBefore;
  // var previousBtn;
  // var nextBtn;
  var videoIframe;
  var searchSuggestions;
  var overlay;
  var toggleTheaterBtn;
  var videoPlayerParent;

  var videos;
  var dataListsMap = new Map();
  var autoCompleteRepository = [];
  var currentlyPlaying = false;

  l.init = function() {
    //DOM bindings
    videoPlayerParent = document.getElementsByClassName('video-player-parent')[0];
    searchBtn = document.getElementById('search-btn');
    searchBox = document.getElementById('search-box');
    publishedAfter = document.getElementById('date-pub-after');
    publishedBefore = document.getElementById('date-pub-before');
    searchResults = document.getElementById('search-results-div');
    // previousBtn = document.getElementById('prev-search');
    // nextBtn = document.getElementById('next-search');
    videoIframe = document.getElementById('video-player');
    // dataList = document.getElementById('video-search-list');
    searchSuggestions = document.getElementById('suggestions-box');
    overlay = document.getElementById('search-overlay');

    toggleTheaterBtn = document.getElementById('toggle-theater');

    setApiInProgress(false);
    l.searchedVideos = [];

    setPrevPageToken(null);
    setNextPageToken(null);
    setIframeSourceUrl(null);
    showSuggestionsDropdown();

    videos = new Map();

    searchBtn.addEventListener('click', onSearchClicked);
    searchBox.addEventListener('keyup', onSearchKeyUp);
    // nextBtn.addEventListener('click', onNextClicked);
    // previousBtn.addEventListener('click', onPreviousClicked);
    searchResults.addEventListener('click', onSearchResultClicked);
    searchResults.addEventListener('scroll', onSearchScroll);
    searchSuggestions.addEventListener('click', onSuggestionResultClicked);
    toggleTheaterBtn.addEventListener('click', onToggleTheaterMode);

    document.body.addEventListener('click', function() {
      searchSuggestions.style.display = 'none';
    });

    //Initial fetchFromYoutube

    fetchDataInternal();
  };

  //Private methods
  function onSuggestionResultClicked(event) {
    event.stopPropagation();
    var target = event.target;
    if(target && target.className == 'suggestion-item') {
      searchBox.value = target.getAttribute('data-text');
    }
    hideSuggestionsBox();
  }
  function onSearchResultClicked(event) {
      var target = event.target;
      var searchItemClassName = 'search-item';
      if(target && !!target.getAttribute('data-video')) {
        setIframeSourceUrl(target.getAttribute('data-video'));
      }
  }

  function onSearchScroll(event) {
      const target = event.target;

      if(haveReachedEnd()) {
        if(l.searchMetaData.nextPageToken) {
          fetchDataInternal(l.searchMetaData.nextPageToken, true);
        }
      }

      function haveReachedEnd() {
          if(target.offsetHeight + target.scrollTop >= target.scrollHeight) {
            return true;
          }
          return false;
      }
  }

  function onSearchKeyUp(event) {
    if(event.key === 'Enter') {
      fetchDataInternal();
    } else {
      showSuggestionsDropdown(event.target.value);
    }
  }

  function onSearchClicked() {
      //Quick date validation
      let dateBefore = publishedBefore.value;
      let dateAfter = publishedAfter.value;

      if(dateBefore && dateAfter) {
        dateBefore = new Date(dateBefore);
        dateAfter = new Date(dateAfter);
        if(dateAfter < dateBefore) {
          alert("Invalid date pair");
          return;
        }
      }

      fetchDataInternal();
  }

  function onToggleTheaterMode() {
    l.isInTheaterMode = !l.isInTheaterMode;
    videoPlayerParent.classList.toggle(THEATER_MODE_CLASS);
    toggleTheaterBtn.innerHTML = l.isInTheaterMode ? THEATER_EXIT : THEATER_ENTER;
  }

  function fetchDataInternal(pageToken = null, appendToPrevious = null) {
    setApiInProgress(true);

    fetchFromYoutube(buildSearchData(pageToken))
    .then(function(response) {
      setApiInProgress(false);
      if(response.ok) {
        return response.json();
      }
    }).then(function(json) {
      if(json) {
        const newItems = json.items;
        l.searchedVideos = appendToPrevious ? l.searchedVideos.concat(newItems) : newItems;
        setNextPageToken(json.nextPageToken);
        setPrevPageToken(json.prevPageToken);

        inflateVideosResultView();
      }
    });
  }

  function onPreviousClicked() {
    fetchDataInternal(l.searchMetaData.previousPageToken);
  }

  function onNextClicked() {
    fetchDataInternal(l.searchMetaData.nextPageToken);
  }

  function setNextPageToken(_tok) {
    l.searchMetaData.nextPageToken = _tok;
    // nextBtn.style.display = _tok ? "inline" : "none";
  }

  function setPrevPageToken(_tok) {
    l.searchMetaData.previousPageToken = _tok;
    // previousBtn.style.display = _tok ? "inline" : "none";
  }

  function fetchFromYoutube(queryParams) {
    return fetch(`${BASE_URL}?${queryParams}`);
  }

  function buildSearchData(pageToken) {
    let searchText = searchBox.value;
    let dateBefore = publishedBefore.value;
    let dateAfter = publishedAfter.value;
    //&publishedBefore=${dateBefore}&publishedAfter=${dateAfter}
    let queryString = `part=snippet&key=${API_KEY}&maxResults=${MAX_RESULTS}`;

    if(!!searchText) {
      queryString += `&q=${searchText}`;

      //TODO: move to better place
      addOptionToDatalist(searchText);
    }

    if(!!dateBefore) {
      queryString += `&publishedBefore=${new Date(dateBefore).toISOString()}`;
    }

    if(!!dateAfter) {
      queryString += `&publishedAfter=${new Date(dateAfter).toISOString()}`;
    }

    if(!!pageToken) {
      queryString += `&pageToken=${pageToken}`;
    }

    return queryString;
  }

  function inflateVideosResultView() {
    let itemsHtml = "";
    let firstId = null;
    l.searchedVideos.map((vid) => {
      //Build search-items-list
      itemsHtml += generateSearchItemHTML(vid.snippet.title, vid.id.videoId);
      if(!firstId) {
        firstId = vid.id.videoId;
      }
    });

    searchResults.innerHTML = itemsHtml;
    if(!currentlyPlaying && firstId) {
      setIframeSourceUrl(firstId);
    }
  }

  function generateSearchItemHTML(title, videoId){
    return `
      <div class="search-item layout-row justify-start" data-video="${videoId}">
        <img src="https://img.youtube.com/vi/${videoId}/0.jpg" data-video="${videoId}">
        <label style="margin-left: 10px;" data-video="${videoId}">${title}</label>
      </div>
    `;
  }

  function setIframeSourceUrl(videoId) {
    if(videoId) {
      videoIframe.style.display = "";
      videoIframe.src = `http://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=http://example.com`;
      currentlyPlaying = true;
    } else {
      videoIframe.style.display = "none";
      currentlyPlaying = false;
    }
  }

  function addOptionToDatalist(optionText) {
    const key = getKey(optionText);
    if(!dataListsMap.get(key)) {
      dataListsMap.set(key, optionText);
      autoCompleteRepository.push(optionText);
    }
  }

  function getKey(str) {
    return str.split(" ").join("-");
  }

  function showSuggestionsDropdown(text) {
    var suggestions = [];
    if(!!text) {
      autoCompleteRepository.map(s => {
        if(s.indexOf(text) > -1) {
            suggestions.push(s);
        }
      });
    }
    inflateSuggestionsBox(suggestions.slice(0,10));
  }

  function inflateSuggestionsBox(suggestions) {
    if(suggestions.length > 0) {
      let html = '';
      suggestions.map(s => {
        html += getSuggestionItemHtml(s);
      });
      searchSuggestions.innerHTML = html;
      searchSuggestions.style.display = "inline";
    } else {
      hideSuggestionsBox();
    }
  }

  function hideSuggestionsBox() {
    searchSuggestions.style.display = "none";
  }

  function getSuggestionItemHtml(text) {
    return `<div class="suggestion-item" data-text="${text}">${text}</div>`;
  }

  function setApiInProgress(progress) {
      l.apiInProgress = progress;
      if(progress) {
        overlay.style.display = "block";
      } else {
        overlay.style.display = "none";
      }
  }

  //Tests

  l.stressTestSuggestions = function() {
      let i = 0;
      let len = 1000000;
      for(; i < len; i++) {
        var optionText = makeid();
        dataListsMap.set(i, optionText);
        autoCompleteRepository.push(optionText);
      }

      function makeid() {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        for (var i = 0; i < 5; i++) {
          text += possible.charAt(Math.floor(Math.random() * possible.length));
        }

        return text;
      }
  };

})(limbo);

limbo.init();

// limbo.stressTestSuggestions();
