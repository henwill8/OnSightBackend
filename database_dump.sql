--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg120+2)
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: update_average_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_average_rating() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update the average rating for the route
    UPDATE routes
    SET average_rating = (
        SELECT AVG(rating)
        FROM ratings
        WHERE route_id = NEW.route_id
    )
    WHERE id = NEW.route_id;

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: gym_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gym_owners (
    gym_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: gyms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gyms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    location character varying(255)
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    route_id uuid NOT NULL,
    rating integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50),
    description character varying(255),
    difficulty character varying(10) NOT NULL,
    gym_id uuid NOT NULL,
    creator uuid NOT NULL,
    image_url text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Data for Name: gym_owners; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gym_owners (gym_id, user_id) FROM stdin;
\.


--
-- Data for Name: gyms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gyms (id, name, location) FROM stdin;
55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	The Carpenter Wall	St George, UT
07fc7fef-14cc-49e4-9eb0-11169f7b3ff8	The Commons Climbing Gym	Boise, ID
3b3e4082-bf5b-43ae-acbc-b0d1543e4771	Contact	St George, UT
b2f352d3-3d03-4412-a936-128abebdeb36	Vertical View	Boise, ID
224c01bd-1f16-476d-a11d-c46a5992af64	Asana	Boise, ID
af742df2-87b3-4b27-a5b7-0382566cff3a	Utah Tech HPC	St George, UT
4f2274f0-eee5-40b0-93f5-8ddf4ea35a89	The Spire	Bozeman, MT
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ratings (id, user_id, route_id, rating, created_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token, created_at) FROM stdin;
97f4c8d5-2705-4585-81d6-1e685dad2bed	13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxM2ZmYmI3OS00NDFmLTRkYzktOTRiNS0yYjFhMGZjNGE5M2IiLCJpYXQiOjE3NDI2NTQxOTMsImV4cCI6MTc0NTI0NjE5M30.zwQfvBoY251-tUs0UPpb_smhDoNamb9A4mKMULE820w	2025-03-22 14:36:33.785752
9b767566-b646-42f3-9432-7ae1a894e639	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDY4MWNmNy00ZGI3LTQzYTctYjVlMi1hZTA1ODdhYjlkOGMiLCJpYXQiOjE3NDI2ODQwNTcsImV4cCI6MTc0NTI3NjA1N30.qmgy5xVog5i3316cvuvJ44wQPUOh0R2GCSI0P2E88LU	2025-03-22 22:54:17.865781
\.


--
-- Data for Name: routes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.routes (id, name, description, difficulty, gym_id, creator, image_url, created_at) FROM stdin;
d0bbe82d-be68-4e01-b9f4-b9aa56e245c2	White Hold Wonder	Only use the white jibs	V8	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742537893677-657819535.jpeg	2025-03-21 06:18:13.924576
f9d4b426-718c-480a-82b7-003c468a3ede	Beam Start 	FA: Noah Kiser	V8.6	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742586663317-492567219.jpeg	2025-03-21 19:51:03.667991
bb8d029e-a922-4b1d-b740-1e9c6f30d3b1	Pinch Pinch	Classic	V10	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742599707947-588743960.jpeg	2025-03-21 23:28:27.980649
0bf4e819-1d92-42e4-a684-23fcfc7a9362	Paddle 	Set by Treyson	v?	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	1742603481937-581183073.jpeg	2025-03-22 00:31:21.979915
15bd114b-2e55-447b-867c-71adfaf91ef8	1 move 10	\N	V11/12	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	1742603882672-297116197.jpeg	2025-03-22 00:38:02.980873
a3ea16cd-a7cb-473e-8357-7a2986949b8e	Pinch perfect 	Finish 1 left of wooden hold	V10	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	1742604152538-592552460.jpeg	2025-03-22 00:42:32.658323
4f202706-a996-4a94-933f-b528858f2380	V6 for sure	Left most finish hold 	V6/10	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	1742604355967-755888713.jpeg	2025-03-22 00:45:56.306244
4298bde0-ef54-4ffa-9375-716afb46b4f9	Slab Dyno	\N	V5	07fc7fef-14cc-49e4-9eb0-11169f7b3ff8	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742606231114-158910453.jpeg	2025-03-22 01:17:11.311684
6a6875bc-70bf-49c3-b882-2bf43d57ad28	Hug that edge!	I really love this route, give it a go! Be careful, it's quite easy to hit your hand against the low volume	V3	07fc7fef-14cc-49e4-9eb0-11169f7b3ff8	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742606343193-641278184.jpeg	2025-03-22 01:19:03.410487
eddb3bb2-b64b-4361-8024-492a1b72a15c	Wheels of Death	\N	V6	07fc7fef-14cc-49e4-9eb0-11169f7b3ff8	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742606475857-191583483.jpeg	2025-03-22 01:21:15.951682
8983455b-c49c-4c33-8d8e-164c425c9c1c	Just Keep Swimming	On the moon board, good luck	V4	07fc7fef-14cc-49e4-9eb0-11169f7b3ff8	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742606556193-608435995.jpeg	2025-03-22 01:22:36.413962
dd82562c-7796-4050-b7a6-81cf04916c29	\N	\N	V1000	4f2274f0-eee5-40b0-93f5-8ddf4ea35a89	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742608930540-297795880.jpeg	2025-03-22 02:02:10.674051
159628f7-c91c-4aba-8e75-5c5d842149f5	\N	\N	V4/5	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610328736-568905386.jpeg	2025-03-22 02:25:28.965524
01bcf7f2-6669-4664-a9d3-3b611696a29e	\N	Ends top of the wall, hard to read at first	V5	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610425691-453522165.jpeg	2025-03-22 02:27:05.788734
374a4977-bba6-4f85-87db-c2653ad33e60	Pink	\N	V4	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610477884-961335072.jpeg	2025-03-22 02:27:57.9635
30694598-7adc-4512-a772-bb50d3d5f0f3	Light Blue	Start on volumes	V8	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610551065-598462117.jpeg	2025-03-22 02:29:11.206875
6ec5cec2-4520-416f-a904-af655737a167	Tan	Crimpy	V9	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610660739-116725021.jpeg	2025-03-22 02:31:00.784691
e3f7318f-2daa-463c-94cd-2205fd5a9075	Purple	Really fun, have to trust some not great holds	V5	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610826285-544231064.jpeg	2025-03-22 02:33:46.507968
1c19c558-899c-488f-a68e-985d539b823e	Yellow	\N	V1	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742610933718-223643742.jpeg	2025-03-22 02:35:33.957248
f8a3fa77-2e36-4e58-b6c0-92e980eff884	Blue	Be careful on it, it's kind of tricky	V5	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742611394642-163925005.jpeg	2025-03-22 02:43:14.970864
75de0caf-cad9-4819-b75c-d765ac6e9204	Cross Underneath	Quick route I made, last two moves are pretty hard	V9/10	af742df2-87b3-4b27-a5b7-0382566cff3a	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742612091329-148873116.jpeg	2025-03-22 02:54:51.598803
de6f2476-eb81-472d-96a9-c83ed6767074	\N	\N	V5	07fc7fef-14cc-49e4-9eb0-11169f7b3ff8	8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	1742619141942-796976658.jpeg	2025-03-22 04:52:21.971763
8ede65d7-5428-43e4-b07c-d258c9a40cca	Sandbox	\N	V6	55bef1c3-9a5b-4af4-820c-c994e3dcb8a4	13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	1742654444952-212495907.jpeg	2025-03-22 14:40:45.16792
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, email, password_hash, created_at) FROM stdin;
13ffbb79-441f-4dc9-94b5-2b1a0fc4a93b	Treyson2	tr3ysonb@gmail.com	$2b$10$eSNlDHEv4ME38UgBFk0R3etTZ8bQNZ7Qo4lPyEmVHuFNDeJlTIEz6	2025-03-21 04:33:45.961773
8d681cf7-4db7-43a7-b5e2-ae0587ab9d8c	Henwill8	henwill8@yahoo.com	$2b$10$TMwCBLIvS99IzdJmpwK2aONMO3I.85skXRtuUyg01DIy8YLRQ9RZC	2025-03-21 06:02:49.819621
\.


--
-- Name: gym_owners gym_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gym_owners
    ADD CONSTRAINT gym_owners_pkey PRIMARY KEY (gym_id, user_id);


--
-- Name: gyms gyms_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gyms
    ADD CONSTRAINT gyms_name_key UNIQUE (name);


--
-- Name: gyms gyms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gyms
    ADD CONSTRAINT gyms_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_user_id_route_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_route_id_key UNIQUE (user_id, route_id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: gym_owners gym_owners_gym_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gym_owners
    ADD CONSTRAINT gym_owners_gym_id_fkey FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: gym_owners gym_owners_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gym_owners
    ADD CONSTRAINT gym_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: routes routes_creator_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_creator_fkey FOREIGN KEY (creator) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: routes routes_gym_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_gym_id_fkey FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

