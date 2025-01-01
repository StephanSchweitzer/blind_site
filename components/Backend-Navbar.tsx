// components/Backend-Navbar.tsx
'use client';

import React from 'react';

const BackendNavbar: React.FC = () => (
    <nav style={{backgroundColor: '#2D3748', padding: '10px', color: 'white'}}>
        <a href="/admin" style={{marginRight: '45px', fontWeight: 'bold'}}>
            Administration
        </a>
        <a href="/admin/books" style={{marginRight: '35px'}}>Catalogue</a>
        <a href="/admin/genres" style={{marginRight: '35px'}}>Genres</a>
        <a href="/admin/news" style={{marginRight: '35px'}}>Dernières infos</a>
        <a href="/admin/manage_coups_de_coeur">Coups de Coeur</a>
    </nav>
);

export default BackendNavbar;
