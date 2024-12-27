// components/Navbar.tsx
'use client';

import React from 'react';

const Navbar: React.FC = () => (
    <nav style={{backgroundColor: '#2D3748', padding: '10px', color: 'white'}}>
        <a href="/dashboard" style={{marginRight: '15px', fontWeight: 'bold'}}>
            Admin Dashboard
        </a>
        <a href="/books" style={{marginRight: '15px'}}>Books</a>
        <a href="/genres" style={{marginRight: '15px'}}>Genres</a>
        <a href="/news">News Articles</a>
    </nav>
);

export default Navbar;
