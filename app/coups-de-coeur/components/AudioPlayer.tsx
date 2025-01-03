import React from 'react';

interface AudioPlayerProps {
    src: string;
    title: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, title }) => {
    return (
        <div className="my-4">
            <div className="mb-2 text-sm text-gray-300">Audio: {title}</div>
            <audio
                controls
                className="w-full"
                aria-label={`Audio player for ${title}`}
            >
                <source src={src} type="audio/mpeg" />
                Votre navigateur ne supporte pas l'élément audio.
            </audio>
        </div>
    );
};