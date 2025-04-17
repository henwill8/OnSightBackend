-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gyms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "gym_id" UUID NOT NULL,
    "parent_id" UUID,

    CONSTRAINT "gym_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_owners" (
    "gym_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_owners_pkey" PRIMARY KEY ("gym_id","user_id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50),
    "description" VARCHAR(255),
    "difficulty" VARCHAR(10) NOT NULL,
    "gym_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "creator" UUID NOT NULL,
    "average_rating" DECIMAL(3,2) DEFAULT 0,
    "image_key" TEXT NOT NULL,
    "annotations_key" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "gyms_name_key" ON "gyms"("name");

-- CreateIndex
CREATE INDEX "gym_locations_gym_id_idx" ON "gym_locations"("gym_id");

-- CreateIndex
CREATE INDEX "gym_locations_parent_id_idx" ON "gym_locations"("parent_id");

-- CreateIndex
CREATE INDEX "routes_location_id_idx" ON "routes"("location_id");

-- CreateIndex
CREATE INDEX "routes_gym_id_idx" ON "routes"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_user_id_route_id_key" ON "ratings"("user_id", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_user_id_device_id_key" ON "refresh_tokens"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "gym_locations" ADD CONSTRAINT "gym_locations_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_locations" ADD CONSTRAINT "gym_locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "gym_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_owners" ADD CONSTRAINT "gym_owners_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_owners" ADD CONSTRAINT "gym_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "gym_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_creator_fkey" FOREIGN KEY ("creator") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
