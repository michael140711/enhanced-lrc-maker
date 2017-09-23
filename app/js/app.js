/**
 * Wraps the main app functionality (GUI etc).
 *
 * Expects certain IDs and classes to be available in the document.
 *
 * @constructor
 */
ELRCMaker = function() {
  // Currently loaded Audio/Lyrics
  var media = this.media = $('video')[0];
  this.lyricsBox = new LyricsBox('#lyrics', media);
  this.lyrics = null;
  this.loadedFilename = null;
  self = this;
  // The Lyrics object needs the duration, not available right away.
  $(media).on('durationchange loadedmetadata',
              function() {
                self.lyrics.duration = media.duration;
              }
             );
  // Install all the UI handlers etc.
  this._setupUI();
  // Enable keyboard shortcuts
  this.shortcuts = Shortcuts(this);
  // Load data from localStorage if there is anything
  //if (localStorage['lyrics']) {
  //$('#introduction').hide();
  //$('#lyrics').show();
  //this.loadLyrics(Lyrics.fromJSON(localStorage['lyrics'], media.duration));
  //}
  //if (localStorage['media']) {
  //this.loadMedia(localStorage['media'], localStorage['mediaFilename']);
  //}
};
ELRCMaker.prototype._setupUI = function() {
  // Be sure not to cache ``lyrics``, the object can change.
  var this$App = this, media = this.media;
  $('.faster').click(function() {
    this$App.setPlaybackRate('+0.1');
  }
                    );
  $('.slower').click(function() {
    this$App.setPlaybackRate('-0.1');
  }
                    );
  this.setPlaybackRate(1.0);
  // Setup position display
  function updatePosition() {
    var text;
    if (media.readyState == media.HAVE_NOTHING)
      text = Lyrics.toTimer(undefined) + ' / ' +
        Lyrics.toTimer(undefined);
    else
      text = Lyrics.toTimer(media.currentTime) + ' / ' +
        Lyrics.toTimer(media.duration)
      $('.position').text(text);
  }
  media.addEventListener('timeupdate', updatePosition);
  media.addEventListener('loadedmetadata', updatePosition);
  updatePosition();
  setInterval(function () {
    updatePosition();
  }
              , 30);
  
  $('.importAudio').click(function() {
    $('#audioSettings').modal("hide");
    var song = document.getElementById("audioURL").value;
    this$App.loadMedia(song, song);
  }
                           );
  // Setup toolbar buttons
  $('.audio-settings').click(function() {
    $('#audioSettings').modal();
  }
                            );
  $('.import-lyrics').click(function() {
    // If lyrics are currently loaded, add them to the import dialog
    // to allow editing them (albeit with loss of timestamps set).
    // Note: Keeping the text originally imported is not good enough,
    // because it might be a format like JSON, ELRC...
    if (this$App.lyrics && this$App.lyrics.length) {
      $('#import textarea').val(
        $.map(this$App.lyrics,
              function(i) {
                return i.text.replace("<br>", "\n")}
             ).join(''));
    }
    $('#import').modal();
  }
                           );
  $('.export').click(function() {
    $('#export textarea').val(this$App.lyrics.toELRC());
    $('#export').modal();
  }
                    );
  $('#export .action').click(function() {
    var bb = new BlobBuilder;
    bb.append(this$App.lyrics.toELRC());
    saveAs(bb.getBlob("text/plain;charset=utf-8"),
           this$App._getExportFilename());
  }
                            );
  $('.export').on('dragstart', function(e) {
    // Allow drag&drop from export button to desktop
    e.originalEvent.dataTransfer.setData(
      "DownloadURL", this$App._makeLyricsUriData());
  }
                 );
  $('.show-help').click(function() {
    $('#help').modal();
  }
                       );
  $('#help .button').click(function() {
    $('#help').modal('hide');
  }
                          );
  // The load-text dialog.
  $('#import .button').on('click', function() {
    var text = $('#import textarea').val();
    this$App.loadLyrics(text);
    // Close dialog
    $('#import').modal('hide');
  }
                         );
  // Enable drag&drop of audio files
  $(document).on('dragenter dragover', function(e) {
    e.stopPropagation();
    e.preventDefault();
  }
                );
  $(document).on('drop', function (event) {
    // originalEvent required, dataTransfer not in jQuery.event.props
    var data = event.originalEvent.dataTransfer;
    var mediaFound, textFound = false;
    for (var i = 0; i < data.files.length; i++) {
      var fileReader = new FileReader();
      if (data.files[i].type.indexOf('audio/') == 0 ||
          data.files[i].type.indexOf('video/') == 0) {
        // Only load the first media file
        if (mediaFound) continue;
        mediaFound = true;
        var theFilename = data.files[i].fileName;
        var isAudio = data.files[i].type.indexOf('audio/')==0;
        fileReader.onload = function(e) {
          if (isAudio) {
            this$App.loadMedia("data:audio/mp3;base64," + window.btoa(e.target.result), theFilename);
          }
          else {
            this$App.loadMedia("data:video/mp4;base64," + window.btoa(e.target.result), theFilename);
          }
          this$App.setVideoMode(!isAudio);
        };
        //old readAsDataURL caused file to be truncated 
        //fileReader.readAsDataURL(data.files[i]);
        fileReader.readAsBinaryString(data.files[i]);
      }
      // Assume a text file
      else {
        // Only load the first text file
        if (textFound) continue;
        textFound = true;
        fileReader.onload = function(e) {
          var text = e.target.result;
          // Support a special JSON format that only I am using.
          var json;
          try {
            json = jQuery.parseJSON(text);
          }
          catch (e) {
          }
          // If this is JSON, load directly.
          if (json) {
            if (json.text)
              this$App.loadLyrics(cleanText(json.text));
            // Only load the audio if nothing was drag&dropped
            // in at the same time.
            if (json.audio && !mediaFound) {
              this$App.loadMedia(json.audio);
            }
          }
          // Otherwise, show import dialog
          else {
            $('#import textarea').val(text);
            $('#import').modal();
          }
        };
        fileReader.readAsText(data.files[i]);
      }
    }
    return false;
  }
                );
  // Some private methods
  this._getExportFilename = function() {
    return (this.loadedFilename || 'export')+".lrc";
  };
  this._makeLyricsUriData = function() {
    // Note that this does not include a data: scheme.
    return "application/octet-stream:"+this._getExportFilename()+
      ":data:application/octet-stream," +
      encodeURIComponent(this.lyrics.toELRC());
  }
};
/**
 * Load the given media url.
 *
 * @param url
 * @param filename Optional, used as a default export filename, for example.
 * @param initial Set if this is a load from localStorage, so it won't be
 *    written back there right away (since a data url can be large).
 */
ELRCMaker.prototype.loadMedia = function(url, filename, initial) {
  this.media.src = url;
  this.loadedFilename = filename;
  // Store in local storage, so it won't be lost in reload
  // Disable this for now, since larger files (>1.5 MB?) cause Chrome to
  // hang for multiple minutes before successfully completing.
  //if (!initial) {
  //    localStorage['audio'] = url;
  //    localStorage['audioFilename'] = filename;
  //}
  //localStorage.removeItem('audio');
  //localStorage.removeItem('audioFilename');
};
/**
 * Show video content, yes or no.
 *
 * @param on_or_off
 */
ELRCMaker.prototype.setVideoMode = function(on_or_off) {
  if (on_or_off)
    $(this.media).addClass('has-video');
  else
    $(this.media).removeClass('has-video');
};
/**
 * Load the given lyrics.
 *
 * If a text is given, it will be parsed. However, you can also specify a
 * lyrics object, in which case this method will simply deal with the required
 * UI updates etc.
 *
 * @param lyrics
 */
ELRCMaker.prototype.loadLyrics = function(lyrics) {
  if (!(lyrics instanceof Lyrics)) {
    if (document.getElementById("plainText").checked) {
      lyrics = Lyrics.fromText(lyrics, this.media.duration);
    }
    else if (document.getElementById("LRC").checked) {
      lyrics = Lyrics.fromLRC(lyrics, this.media.duration);
    }
  }
  this.lyrics = lyrics;
  this.lyricsBox.setLyrics(lyrics);
  console.log(this.lyrics);
  // Store in local storage, so it won't be lost in reload
  //localStorage['lyrics'] = JSON.stringify(lyrics);
  // Auto-save feature
  this.lyrics.on('timeChanged', function(index, time) {
    //localStorage['lyrics'] = JSON.stringify(lyrics);
  }
                );
  // Hide introduction, show, show lyrics
  $('#introduction').slideUp();
  $('#lyrics').slideDown();
};
/**
 * Change the playback speed. This ensures minimum/maximum rates rates, and
 * allows for string values to be passed for relative changes (e.g. "-0.1").
 * @param rate
 */
ELRCMaker.prototype.setPlaybackRate = function(rate) {
  var newRate = this.media.playbackRate;
  if (rate.constructor == Number)
    newRate = rate;
  else
    newRate += parseFloat(rate);
  newRate = Math.min(Math.max(newRate, 0.5), 4.0);
  this.media.playbackRate = newRate;
  $('#controls .speed').text(newRate.toFixed(3));
};
