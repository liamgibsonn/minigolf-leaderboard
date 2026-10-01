Sound effects for the big screen's pop-ups (MP3 files). Which file plays when is set at
the top of public/popups.js (COMBO.sounds, and each type's `sounds` in POPUPS).

Lengths, for lining up times in popups.js:

  pinball.mp3    0.55s
  eaglein.mp3    1.67s
  eagleout.mp3   1.67s
  choir.mp3      2.09s
  eagle.mp3      3.34s

After editing a file, check its new length with (needs ffmpeg installed):

  ffprobe -v error -show_entries format=duration -of csv=p=0 public/sounds/pinball.mp3

As a combo stacks up in any pop-up:

  1st to 4th result   pinball.mp3
  5th (the jackpot)   pinball.mp3 and choir.mp3 together
  6th and later       silent

Eagle pop-ups go like this:

  0s      eaglein.mp3, nothing on screen yet
  1.45s   eagle.mp3, as the eagle swoops in
  2.7s    the animals pop in with the pinballs (choir on the 5th)
  6.4s    eagleout.mp3, as the eagle flies off

Any file that's missing just stays silent. Open the
big screen with /?popup-preview on the end of the address to loop sample pop-ups.

Credits

  pinball.mp3
    From "Classic Pinball Gameplay" by theshaggyfreak
    https://freesound.org/s/404144/
    Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
    Trimmed and edited.

  eagle.mp3, eaglein.mp3, eagleout.mp3
    From "RAM_Mouth Hawk_rev_v1.wav" by reidedo
    https://freesound.org/s/344445/
    Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
    Trimmed and edited; eaglein and eagleout are the two halves.

  choir.mp3
    From Freesound, CC0 (public domain, no credit required). Trimmed and edited.
