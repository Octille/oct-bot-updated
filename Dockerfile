# 1. Use Java 17 as the base
FROM eclipse-temurin:17-jdk-jammy

# 2. Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# 3. Standard Node setup
COPY package*.json ./
RUN npm ci

# 4. Copy everything else (including your lavalink/ folder)
COPY . .

# 5. Download Lavalink.jar DIRECTLY into your lavalink folder
ADD https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar ./lavalink/Lavalink.jar

# 6. Start both
# We use -xe to debug. 'set -xe' prints every command to the logs as it runs.
CMD ["/bin/sh", "-c", "set -xe; cd lavalink && java -jar Lavalink.jar & sleep 30; cd /app && node index.js"]