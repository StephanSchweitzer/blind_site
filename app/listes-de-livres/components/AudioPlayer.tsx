import React from 'react';

interface AudioPlayerProps {
    src: string;
    title: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, title }) => {
    return (
        <div className="my-4">
            {/* text-gray-300 was unreadable on the light theme's near-white card
                (about 1.5:1); the label also needs to be French, since it is the
                only description of what the player plays (RGAA 3.2). */}
            <div className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                Version audio : {title}
            </div>
            <audio
                controls
                className="w-full"
                aria-label={`Lecteur audio — ${title}`}
            >
                <source src={src} type="audio/mpeg" />
                Votre navigateur ne supporte pas l&apos;élément audio.
            </audio>
        </div>
    );
};
