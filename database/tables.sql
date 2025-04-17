-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS ltree;

-- Users table
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gyms table
CREATE TABLE gyms (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    location VARCHAR(255),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6)
);

-- Gym locations table using ltree for hierarchical paths
CREATE TABLE gym_locations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    parent_id UUID NULL REFERENCES gym_locations(id) ON DELETE CASCADE,
    path LTREE NOT NULL
);

CREATE INDEX idx_gym_locations_path ON gym_locations USING GIST(path);
CREATE INDEX idx_gym_locations_gym_id ON gym_locations(gym_id);
CREATE INDEX idx_gym_locations_parent_id ON gym_locations(parent_id);

-- Gym owners
CREATE TABLE gym_owners (
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (gym_id, user_id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Routes table
CREATE TABLE routes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(50),
    description VARCHAR(255),
    difficulty VARCHAR(10) NOT NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES gym_locations(id) ON DELETE CASCADE,
    creator UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    average_rating DECIMAL(3,2) DEFAULT 0,
    image_key TEXT NOT NULL,
    annotations_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_routes_location_id ON routes(location_id);
CREATE INDEX idx_routes_gym_id ON routes(gym_id);

-- Ratings table
CREATE TABLE ratings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, route_id)
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id UUID NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);