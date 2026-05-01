FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Esegue `npm install` ad ogni avvio del container per allineare il volume
# anonimo /app/node_modules a eventuali nuove dipendenze aggiunte al
# package.json. Se i pacchetti sono già installati npm rileva il lockfile
# coerente e termina in pochi secondi.
CMD sh -c "npm install --silent && npm run dev -- --host 0.0.0.0"